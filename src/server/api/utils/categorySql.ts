import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

/** 与 Prisma schema 一致；用原生 SQL 避免「未 prisma generate」时 Client 不含 parentId/children 导致报错 */
export type CategoryRow = {
    id: string;
    name: string;
    description: string;
    icon: string;
    parentId: string | null;
    createdAt: Date;
    updatedAt: Date;
};

export async function sqlSelectRoots(db: PrismaClient): Promise<CategoryRow[]> {
    return db.$queryRaw<CategoryRow[]>(
        Prisma.sql`
            SELECT * FROM "Category"
            WHERE "parentId" IS NULL
            ORDER BY "createdAt" DESC
        `
    );
}

export async function sqlSelectChildrenForParents(
    db: PrismaClient,
    parentIds: string[]
): Promise<CategoryRow[]> {
    if (parentIds.length === 0) return [];
    return db.$queryRaw<CategoryRow[]>(
        Prisma.sql`
            SELECT * FROM "Category"
            WHERE "parentId" IN (${Prisma.join(parentIds)})
            ORDER BY "createdAt" DESC
        `
    );
}

export async function sqlSelectCategoryTree(db: PrismaClient) {
    const roots = await sqlSelectRoots(db);
    const children = await sqlSelectChildrenForParents(
        db,
        roots.map((r) => r.id)
    );
    const byParent = new Map<string, CategoryRow[]>();
    for (const c of children) {
        if (!c.parentId) continue;
        const arr = byParent.get(c.parentId) ?? [];
        arr.push(c);
        byParent.set(c.parentId, arr);
    }
    return {
        roots: roots.map((r) => ({
            ...r,
            children: byParent.get(r.id) ?? [],
        })),
    };
}

/** 无子行的分类（叶子），用于商品挂载 */
export async function sqlSelectLeafCategories(
    db: PrismaClient
): Promise<CategoryRow[]> {
    return db.$queryRaw<CategoryRow[]>(
        Prisma.sql`
            SELECT c.*
            FROM "Category" c
            WHERE NOT EXISTS (
                SELECT 1 FROM "Category" c2 WHERE c2."parentId" = c.id
            )
            ORDER BY c."parentId" ASC NULLS FIRST, c."createdAt" DESC
        `
    );
}

const LIST_ORDER_FIELDS = new Set(['createdAt', 'name', 'updatedAt']);

type ListFilter = {
    parentId: string | null | undefined;
    orderBy?: string;
    order?: 'asc' | 'desc';
    skip: number;
    take: number;
};

export async function sqlCountCategories(
    db: PrismaClient,
    parentId: string | null | undefined
): Promise<number> {
    let rows: [{ count: bigint }];
    if (parentId === undefined) {
        rows = await db.$queryRaw<[{ count: bigint }]>(
            Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "Category"`
        );
    } else if (parentId === null) {
        rows = await db.$queryRaw<[{ count: bigint }]>(
            Prisma.sql`
                SELECT COUNT(*)::bigint AS count FROM "Category"
                WHERE "parentId" IS NULL
            `
        );
    } else {
        rows = await db.$queryRaw<[{ count: bigint }]>(
            Prisma.sql`
                SELECT COUNT(*)::bigint AS count FROM "Category"
                WHERE "parentId" = ${parentId}
            `
        );
    }
    return Number(rows[0]?.count ?? 0);
}

type CategoryListRow = CategoryRow & {
    _children: bigint;
    _products: bigint;
};

function listOrderByClause(orderBy: string | undefined, order: 'asc' | 'desc' | undefined) {
    const col = LIST_ORDER_FIELDS.has(orderBy ?? '')
        ? (orderBy as string)
        : 'createdAt';
    const dir = order === 'asc' ? 'ASC' : 'DESC';
    const colQuoted =
        col === 'name'
            ? '"name"'
            : col === 'updatedAt'
              ? '"updatedAt"'
              : '"createdAt"';
    return Prisma.sql`ORDER BY c.${Prisma.raw(colQuoted)} ${Prisma.raw(dir)}`;
}

export async function sqlSelectCategoryListPage(
    db: PrismaClient,
    input: ListFilter
): Promise<CategoryListRow[]> {
    const { parentId, orderBy, order, skip, take } = input;
    const ob = listOrderByClause(orderBy, order);

    const selectFrom = Prisma.sql`
        SELECT c.*,
            (SELECT COUNT(*)::bigint FROM "Category" ch WHERE ch."parentId" = c.id) AS "_children",
            (SELECT COUNT(*)::bigint FROM "Product" p WHERE p."categoryId" = c.id AND p."isDeleted" = false) AS "_products"
        FROM "Category" c
    `;

    if (parentId === undefined) {
        return db.$queryRaw<CategoryListRow[]>(
            Prisma.sql`${selectFrom} ${ob} LIMIT ${take} OFFSET ${skip}`
        );
    }
    if (parentId === null) {
        return db.$queryRaw<CategoryListRow[]>(
            Prisma.sql`${selectFrom} WHERE c."parentId" IS NULL ${ob} LIMIT ${take} OFFSET ${skip}`
        );
    }
    return db.$queryRaw<CategoryListRow[]>(
        Prisma.sql`${selectFrom} WHERE c."parentId" = ${parentId} ${ob} LIMIT ${take} OFFSET ${skip}`
    );
}

export function mapListRowToApi(
    row: CategoryListRow
): CategoryRow & {
    _count: { children: number; products: number };
} {
    const { _children, _products, ...rest } = row;
    return {
        ...rest,
        _count: {
            children: Number(_children),
            products: Number(_products),
        },
    };
}

export async function sqlCountChildrenByParentId(
    db: PrismaClient,
    categoryId: string
): Promise<number> {
    const rows = await db.$queryRaw<[{ count: bigint }]>(
        Prisma.sql`
            SELECT COUNT(*)::bigint AS count FROM "Category"
            WHERE "parentId" = ${categoryId}
        `
    );
    return Number(rows[0]?.count ?? 0);
}

export async function sqlGetParentIdByCategoryId(
    db: PrismaClient,
    categoryId: string
): Promise<string | null | undefined> {
    const rows = await db.$queryRaw<[{ parentId: string | null }]>(
        Prisma.sql`
            SELECT "parentId" FROM "Category" WHERE id = ${categoryId}
        `
    );
    return rows[0]?.parentId;
}

/** 批量查分类的 parentId，供商品列表等在 Prisma select 中不写 parentId（避免 Client 未 generate 时报错） */
export async function sqlGetParentIdsByCategoryIds(
    db: PrismaClient,
    categoryIds: string[]
): Promise<Map<string, string | null>> {
    if (categoryIds.length === 0) return new Map();
    const rows = await db.$queryRaw<
        Array<{ id: string; parentId: string | null }>
    >(
        Prisma.sql`
            SELECT id, "parentId" FROM "Category"
            WHERE id IN (${Prisma.join(categoryIds)})
        `
    );
    return new Map(rows.map((r) => [r.id, r.parentId]));
}

/** 插入分类（含 parentId），绕过旧 Prisma Client 不认 data.parentId 的问题 */
export async function sqlInsertCategory(
    db: PrismaClient,
    input: {
        id: string;
        name: string;
        description: string;
        icon: string;
        parentId: string | null;
    }
): Promise<void> {
    await db.$executeRaw(
        Prisma.sql`
            INSERT INTO "Category" (id, name, description, icon, "parentId", "createdAt", "updatedAt")
            VALUES (
                ${input.id},
                ${input.name},
                ${input.description},
                ${input.icon},
                ${input.parentId},
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            )
        `
    );
}

/** 更新分类；parentId 为 undefined 时不改父级 */
export async function sqlUpdateCategory(
    db: PrismaClient,
    input: {
        id: string;
        name: string;
        description: string;
        icon: string;
        parentId: string | null | undefined;
    }
): Promise<void> {
    if (input.parentId !== undefined) {
        await db.$executeRaw(
            Prisma.sql`
                UPDATE "Category"
                SET
                    name = ${input.name},
                    description = ${input.description},
                    icon = ${input.icon},
                    "parentId" = ${input.parentId},
                    "updatedAt" = CURRENT_TIMESTAMP
                WHERE id = ${input.id}
            `
        );
    } else {
        await db.$executeRaw(
            Prisma.sql`
                UPDATE "Category"
                SET
                    name = ${input.name},
                    description = ${input.description},
                    icon = ${input.icon},
                    "updatedAt" = CURRENT_TIMESTAMP
                WHERE id = ${input.id}
            `
        );
    }
}
