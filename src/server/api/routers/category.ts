import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import {
    createTRPCRouter,
    publicProcedure,
    superAdminProcedure,
} from '@/server/api/trpc';
import { logger } from '@/server/api/utils/logger';
import { attachParentByParentId } from '@/server/api/utils/categoryParents';
import {
    sqlCountCategories,
    sqlCountChildrenByParentId,
    sqlGetParentIdByCategoryId,
    sqlSelectCategoryListPage,
    sqlSelectCategoryTree,
    sqlSelectLeafCategories,
    sqlSelectRoots,
    mapListRowToApi,
    sqlInsertCategory,
    sqlUpdateCategory,
} from '@/server/api/utils/categorySql';

/** 表单/JSON 常把「未选父级」传成 ""，必须转为 null，否则会触发无效外键 */
function normalizeParentIdForCreate(
    parentId: string | null | undefined
): string | null {
    if (parentId == null || parentId === '') {
        return null;
    }
    return parentId;
}

/** 更新时：undefined 表示不修改；null / "" 表示改为一级（无父级） */
function normalizeParentIdForUpdate(
    parentId: string | null | undefined
): string | null | undefined {
    if (parentId === undefined) {
        return undefined;
    }
    if (parentId === null || parentId === '') {
        return null;
    }
    return parentId;
}

/** 仅允许二级：父级必须是一级（parentId 为空） */
async function assertParentIsRoot(
    ctx: { db: PrismaClient },
    parentId: string
) {
    const parentPid = await sqlGetParentIdByCategoryId(ctx.db, parentId);
    if (parentPid === undefined) {
        throw new Error('父分类不存在');
    }
    if (parentPid) {
        throw new Error('仅支持二级分类，不能在子分类下再建子分类');
    }
}

/** 父分类下若已有商品，则不能再创建子分类（避免商品与带子分类的父级冲突） */
async function assertParentHasNoProducts(
    ctx: { db: PrismaClient },
    parentId: string
) {
    const n = await ctx.db.product.count({
        where: { categoryId: parentId, isDeleted: false },
    });
    if (n > 0) {
        throw new Error(
            '该一级分类下已有商品，无法在其下新增子分类，请先移除商品或迁移到子分类后再试'
        );
    }
}

export const categoryRouter = createTRPCRouter({
    tree: publicProcedure.query(async ({ ctx }) => {
        return sqlSelectCategoryTree(ctx.db);
    }),

    roots: publicProcedure.query(async ({ ctx }) => {
        return sqlSelectRoots(ctx.db);
    }),

    leafCategories: publicProcedure.query(async ({ ctx }) => {
        const rows = await sqlSelectLeafCategories(ctx.db);
        return attachParentByParentId(ctx.db, rows);
    }),

    list: publicProcedure
        .input(
            z
                .object({
                    orderBy: z.string().optional(),
                    order: z.enum(['asc', 'desc']).optional(),
                    page: z.number().min(1).optional().default(1),
                    pageSize: z.number().min(1).max(100).optional().default(10),
                    parentId: z.string().nullable().optional(),
                })
                .optional()
        )
        .query(async ({ ctx, input }) => {
            const page = input?.page ?? 1;
            const pageSize = input?.pageSize ?? 10;
            const skip = (page - 1) * pageSize;

            const total = await sqlCountCategories(ctx.db, input?.parentId);

            const rows = await sqlSelectCategoryListPage(ctx.db, {
                parentId: input?.parentId,
                orderBy: input?.orderBy,
                order: input?.order,
                skip,
                take: pageSize,
            });
            const mapped = rows.map(mapListRowToApi);
            const data = await attachParentByParentId(ctx.db, mapped);

            return {
                data,
                pagination: {
                    page,
                    pageSize,
                    total,
                    totalPages: Math.ceil(total / pageSize),
                },
            };
        }),

    create: superAdminProcedure
        .input(
            z.object({
                name: z.string(),
                description: z.string().optional(),
                icon: z.string().optional(),
                parentId: z.string().nullable().optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const parentId = normalizeParentIdForCreate(input.parentId);

            if (parentId) {
                await assertParentIsRoot(ctx, parentId);
                await assertParentHasNoProducts(ctx, parentId);
            }

            const id = randomUUID();
            await sqlInsertCategory(ctx.db, {
                id,
                name: input.name,
                description: input.description ?? '',
                icon: input.icon ?? '',
                parentId,
            });

            await logger.adminCreate(ctx, 'category', id, input.name);

            return {
                message: '创建成功',
            };
        }),

    update: superAdminProcedure
        .input(
            z.object({
                id: z.string(),
                name: z.string(),
                description: z.string().optional(),
                icon: z.string().optional(),
                parentId: z.string().nullable().optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const { id, ...rest } = input;
            const nextParentId = normalizeParentIdForUpdate(rest.parentId);

            const existing = await ctx.db.category.findUnique({
                where: { id },
            });
            if (!existing) {
                throw new Error('分类不存在');
            }

            const childCount = await sqlCountChildrenByParentId(ctx.db, id);

            if (nextParentId !== undefined) {
                if (nextParentId === id) {
                    throw new Error('不能将自身设为父分类');
                }
                if (nextParentId) {
                    await assertParentIsRoot(ctx, nextParentId);
                    await assertParentHasNoProducts(ctx, nextParentId);
                }
                if (childCount > 0 && nextParentId) {
                    throw new Error('该分类下已有子分类，不能修改为子分类');
                }
            }

            await sqlUpdateCategory(ctx.db, {
                id,
                name: rest.name,
                description: rest.description ?? '',
                icon: rest.icon ?? '',
                parentId: nextParentId,
            });
            return { message: '更新成功' };
        }),

    delete: superAdminProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const childCount = await sqlCountChildrenByParentId(
                ctx.db,
                input.id
            );
            if (childCount > 0) {
                throw new Error(
                    `无法删除：该分类下还有 ${childCount} 个子分类，请先删除子分类`
                );
            }

            const productCount = await ctx.db.product.count({
                where: {
                    categoryId: input.id,
                    isDeleted: false,
                },
            });

            if (productCount > 0) {
                throw new Error(
                    `无法删除：该分类下还有 ${productCount} 个商品`
                );
            }

            return ctx.db.category.delete({ where: { id: input.id } });
        }),

    deleteMany: superAdminProcedure
        .input(z.object({ ids: z.array(z.string()) }))
        .mutation(async ({ ctx, input }) => {
            if (input.ids.length === 0) {
                return { count: 0 };
            }

            const withChildren = await ctx.db.$queryRaw<
                Array<{ id: string; name: string }>
            >(
                Prisma.sql`
                    SELECT c.id, c.name FROM "Category" c
                    WHERE c.id IN (${Prisma.join(input.ids)})
                    AND EXISTS (
                        SELECT 1 FROM "Category" ch WHERE ch."parentId" = c.id
                    )
                `
            );

            if (withChildren.length > 0) {
                const names = withChildren.map((c) => c.name).join('、');
                throw new Error(`无法删除：以下分类仍包含子分类：${names}`);
            }

            const categoriesWithProducts = await ctx.db.category.findMany({
                where: {
                    id: { in: input.ids },
                    products: {
                        some: {
                            isDeleted: false,
                        },
                    },
                },
                select: { id: true, name: true },
            });

            if (categoriesWithProducts.length > 0) {
                const categoryNames = categoriesWithProducts
                    .map((c) => c.name)
                    .join('、');
                throw new Error(`无法删除：分类 ${categoryNames} 下还有商品`);
            }

            return ctx.db.category.deleteMany({
                where: { id: { in: input.ids } },
            });
        }),
});
