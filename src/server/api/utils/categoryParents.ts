import type { PrismaClient } from '@prisma/client';

/**
 * 用 parentId 批量查父级名称，避免 Prisma include `parent`（在 prisma generate 未执行或 Client 过期时会报错）。
 */
export async function attachParentByParentId<
    T extends { parentId: string | null },
>(
    db: PrismaClient,
    rows: T[]
): Promise<(T & { parent: { id: string; name: string } | null })[]> {
    const parentIds = [
        ...new Set(
            rows.map((r) => r.parentId).filter((id): id is string => !!id)
        ),
    ];
    if (parentIds.length === 0) {
        return rows.map((r) => ({ ...r, parent: null }));
    }
    const parents = await db.category.findMany({
        where: { id: { in: parentIds } },
        select: { id: true, name: true },
    });
    const map = new Map(parents.map((p) => [p.id, p]));
    return rows.map((r) => ({
        ...r,
        parent: r.parentId ? (map.get(r.parentId) ?? null) : null,
    }));
}
