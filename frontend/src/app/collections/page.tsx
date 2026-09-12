'use client';

import { useEffect, useMemo, useState } from 'react';
import CollectionHeader from '@/components/header/CollectionHeader';
import CollectionContent from '@/components/collection/CollectionContent';
import { collectionService } from '@/services/collections';
import type { SearchResult } from '@/services/search';

const subjectTypes: Record<string, number | undefined> = { all: undefined, books: 1, anime: 2, games: 4, real: 6 };
const collectionStatuses: Record<string, number | undefined> = { all: undefined, watching: 3, planned: 1, on_hold: 4, completed: 2 };

export default function CollectionPage() {
  const [searchKw, setSearchKw] = useState('');
  const [filterValue, setFilterValue] = useState('all');
  const [statusValue, setStatusValue] = useState('all');
  const [sortBy, setSortBy] = useState('updated_at');
  const [collections, setCollections] = useState<SearchResult[]>([]);

  useEffect(() => {
    let active = true;
    void collectionService.getCollections({
      subject_type: subjectTypes[filterValue],
      status: collectionStatuses[statusValue],
      keyword: searchKw.trim() || undefined,
      limit: 100,
      sort_by: sortBy,
    }).then((response) => {
      if (active) setCollections(response.items);
    }).catch(() => {
      if (active) setCollections([]);
    });
    return () => { active = false; };
  }, [filterValue, searchKw, sortBy, statusValue]);

  const items = useMemo(() => {
    const keyword = searchKw.trim().toLocaleLowerCase();
    const subjectType = subjectTypes[filterValue];
    const status = collectionStatuses[statusValue];
    const filtered = collections.filter(({ subject, collection }) =>
      (subjectType === undefined || subject.type === subjectType) &&
      (status === undefined || collection?.type === status) &&
      (!keyword || [subject.name, subject.name_cn, ...(subject.tags || []).map((tag) => tag.name)].some((value) => value.toLocaleLowerCase().includes(keyword)))
    );

    return [...filtered].sort((a, b) => {
      if (sortBy === 'score') return (b.subject.rating?.score || b.subject.score) - (a.subject.rating?.score || a.subject.score);
      if (sortBy === 'date') return (b.subject.date || '').localeCompare(a.subject.date || '');
      if (sortBy === 'rate') return (b.collection?.rate || 0) - (a.collection?.rate || 0);
      return b.subject.id - a.subject.id;
    });
  }, [collections, filterValue, searchKw, sortBy, statusValue]);

  return (
    <div className="nexus-workspace-page flex h-full flex-col overflow-hidden">
      <div className="z-10 flex-none">
        <CollectionHeader
          onSearch={setSearchKw}
          filterValue={filterValue}
          onFilterChange={setFilterValue}
          statusValue={statusValue}
          onStatusChange={setStatusValue}
          onSortChange={setSortBy}
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        <CollectionContent items={items} />
      </div>
    </div>
  );
}
