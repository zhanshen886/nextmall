'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    Box,
    Button,
    Flex,
    Text,
    VStack,
    Input,
    Wrap,
} from '@chakra-ui/react';
import { InputGroup } from '@/app/_components/ui';
import { FiSearch } from 'react-icons/fi';
import { api } from '@/trpc/react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProductItem from '@/app/h5/_components/ProductItem';
import { ContentLoading } from '@/app/_components/LoadingSpinner';

export default function CategoryPageClient() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const idParam = searchParams.get('id');
    const subParam = searchParams.get('sub');

    const { data: treeData, isLoading: treeLoading } =
        api.category.tree.useQuery(undefined, {
            refetchOnMount: 'always',
            staleTime: 1000 * 60,
            gcTime: 1000 * 60 * 5,
        });
    const roots = treeData?.roots ?? [];

    const [activeRootId, setActiveRootId] = useState<string | null>(null);
    const [activeSubId, setActiveSubId] = useState<string | null>(null);

    useEffect(() => {
        if (roots.length === 0) return;

        let root = roots.find((r) => r.id === idParam);
        let matchedSubFromParent: { id: string } | undefined;

        if (!root && idParam) {
            for (const r of roots) {
                const sub = r.children?.find((c) => c.id === idParam);
                if (sub?.id) {
                    root = r;
                    matchedSubFromParent = { id: sub.id };
                    break;
                }
            }
        }

        if (!root) {
            root = roots[0];
        }

        setActiveRootId(root.id);
        const subs = root.children ?? [];
        if (subs.length > 0) {
            const fromSubQuery = subParam
                ? subs.find((s) => s.id === subParam)
                : undefined;
            const pick =
                matchedSubFromParent ?? fromSubQuery ?? subs[0];
            if (pick?.id) {
                setActiveSubId(pick.id);
            } else {
                setActiveSubId(null);
            }
        } else {
            setActiveSubId(null);
        }
    }, [roots, idParam, subParam]);

    const activeRoot = roots.find((r) => r.id === activeRootId);
    const subs = activeRoot?.children ?? [];

    const productQueryInput = useMemo(() => {
        if (!activeRoot) return undefined;
        if (subs.length > 0 && activeSubId) {
            return { categoryId: activeSubId };
        }
        return { categoryId: activeRoot.id };
    }, [activeRoot, subs.length, activeSubId]);

    const { data: productResponse, isLoading: productsLoading } =
        api.product.list.useQuery(productQueryInput ?? {}, {
            enabled: productQueryInput != null,
        });

    const products = productResponse?.data ?? [];

    const setRootAndUrl = (r: (typeof roots)[0]) => {
        setActiveRootId(r.id);
        const ch = r.children ?? [];
        if (ch.length > 0) {
            const first = ch[0].id;
            setActiveSubId(first);
            router.replace(`/h5/category?id=${r.id}&sub=${first}`);
        } else {
            setActiveSubId(null);
            router.replace(`/h5/category?id=${r.id}`);
        }
    };

    const setSubAndUrl = (sid: string) => {
        if (!activeRootId) return;
        setActiveSubId(sid);
        router.replace(`/h5/category?id=${activeRootId}&sub=${sid}`);
    };

    if (treeLoading) {
        return <ContentLoading text="分类加载中..." />;
    }

    if (roots.length === 0) {
        return (
            <Box p={4}>
                <Text color="gray.600">暂无分类</Text>
            </Box>
        );
    }

    return (
        <Flex h="calc(100vh - 64px)" flexDirection="column" overflow="hidden">
            <Box px={4} pt={4} w="100%">
                <InputGroup
                    w="100%"
                    startOffset="0px"
                    startElement={<FiSearch color="#bbb" size={20} />}
                >
                    <Input
                        size="sm"
                        placeholder="搜索"
                        variant="outline"
                        bg="white"
                        borderRadius="full"
                        _focus={{ bg: 'white' }}
                        _placeholder={{ color: 'gray.400' }}
                        onClick={() => router.push('/full/search')}
                        readOnly
                        cursor="pointer"
                    />
                </InputGroup>
            </Box>
            <Flex flex={1} bg="gray.50" h="0" mt={4} minH={0} overflow="hidden">
                <VStack
                    as="nav"
                    align="stretch"
                    gap={0}
                    w="100px"
                    h="100%"
                    bg="white"
                    overflowY="auto"
                    borderRight="1px solid #eee"
                    flexShrink={0}
                >
                    {roots.map((cat) => {
                        const idxActive = activeRootId === cat.id;
                        return (
                            <Box
                                key={cat.id}
                                px={3}
                                py={4}
                                cursor="pointer"
                                bg={idxActive ? 'gray.100' : 'white'}
                                color={idxActive ? 'red.500' : 'gray.800'}
                                fontWeight={idxActive ? 'bold' : 'normal'}
                                borderLeft={
                                    idxActive
                                        ? '3px solid #f00'
                                        : '3px solid transparent'
                                }
                                transition="all 0.2s"
                                onClick={() => setRootAndUrl(cat)}
                                _hover={{ bg: 'gray.50' }}
                                textAlign="center"
                                fontSize="sm"
                            >
                                {cat.name}
                            </Box>
                        );
                    })}
                </VStack>

                <Box flex={1} h="100%" overflowY="auto" p={4} minW={0}>
                    <Text fontSize="md" fontWeight="bold" mb={2}>
                        {activeRoot ? activeRoot.name : ''}
                        {subs.length > 0 && activeSubId
                            ? ` · ${
                                  subs.find((s) => s.id === activeSubId)
                                      ?.name ?? ''
                              }`
                            : ''}
                    </Text>

                    {subs.length > 0 && (
                        <Wrap gap={2} mb={4}>
                            {subs.map((s) => (
                                <Button
                                    key={s.id}
                                    type="button"
                                    size="xs"
                                    variant={
                                        activeSubId === s.id
                                            ? 'solid'
                                            : 'outline'
                                    }
                                    colorScheme={
                                        activeSubId === s.id ? 'red' : 'gray'
                                    }
                                    borderRadius="full"
                                    onClick={() => setSubAndUrl(s.id)}
                                >
                                    {s.name}
                                </Button>
                            ))}
                        </Wrap>
                    )}

                    {productsLoading ? (
                        <ContentLoading text="商品加载中..." />
                    ) : (
                        <Flex wrap="wrap" gap={3}>
                            <ProductItem products={products} />
                        </Flex>
                    )}
                </Box>
            </Flex>
        </Flex>
    );
}
