import { ActionIcon } from '@lobehub/ui';
import { Popover, Input, Button, Tag } from 'antd';
import { Search, Star, CheckCircle2 } from 'lucide-react';
import React, { useState } from 'react';
import Image from 'next/image';
import { searchService, type SearchResult } from '@/services/search';

export interface SearchResultItem {
  id: string;
  subjectId: number;
  title: string;
  cover: string;
  score: number;
  tags: string[];
  hasCollection: boolean;
  source: string;
  sourceId: string | number;
  fullItem?: unknown;
}

interface SearchTriggerProps {
  onSelect?: (item: SearchResultItem) => void;
}

const toSearchResultItem = (item: SearchResult): SearchResultItem => ({
  id: String(item.subject.id),
  subjectId: item.subject.id,
  title: item.subject.name_cn || item.subject.name,
  cover: item.subject.image || item.subject.images?.common || '',
  score: item.subject.rating?.score || item.subject.score || 0,
  tags: (item.subject.tags || []).map((tag) => tag.name),
  hasCollection: Boolean(item.collection),
  source: item.subject.source,
  sourceId: item.subject.source_id || item.subject.id,
  fullItem: item,
});

export default function SearchTrigger({ onSelect }: SearchTriggerProps) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    const query = keyword.trim();
    if (!query) return;
    setLoading(true);
    try {
      const items = await searchService.searchSubjects({ keyword: query, limit: 10 });
      setResults(items.map(toSearchResultItem));
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  const content = (
    <div style={{ width: 320, padding: 4 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <Input placeholder="搜索作品" value={keyword} onChange={(event) => setKeyword(event.target.value)} onPressEnter={handleSearch} />
        <Button type="primary" loading={loading} onClick={handleSearch}>搜索</Button>
      </div>
      <div style={{ maxHeight: 300, overflowY: 'auto', borderRadius: 10, border: '1px solid var(--lobe-color-border)' }}>
        {results.length ? results.map((item) => (
          <button
            type="button"
            key={item.id}
            className="chat-demo-search-item"
            onClick={() => { onSelect?.(item); setOpen(false); setKeyword(''); setResults([]); setSearched(false); }}
          >
            <Image src={item.cover || '/Icon.png'} alt="" width={38} height={52} />
            <span><strong>{item.title}</strong><small>{item.tags.slice(0, 3).map((tag) => <Tag key={tag}>{tag}</Tag>)}</small></span>
            <i><Star size={12} fill="currentColor" />{item.score.toFixed(1)}{item.hasCollection && <CheckCircle2 size={13} />}</i>
          </button>
        )) : <p className="chat-demo-search-empty">{searched ? '没有匹配的作品' : '输入作品名后搜索'}</p>}
      </div>
      <style>{`
        .chat-demo-search-item{width:100%;padding:9px;display:flex;align-items:center;gap:10px;color:inherit;border:0;border-bottom:1px solid var(--lobe-color-border);background:transparent;text-align:left;cursor:pointer}
        .chat-demo-search-item:hover{background:var(--lobe-color-fill-tertiary)}
        .chat-demo-search-item:last-child{border-bottom:0}.chat-demo-search-item img{width:38px;height:52px;object-fit:cover;border-radius:6px}.chat-demo-search-item>span{min-width:0;flex:1}.chat-demo-search-item strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.chat-demo-search-item small{margin-top:5px;display:flex;gap:3px}.chat-demo-search-item small .ant-tag{margin:0;font-size:9px;line-height:17px}.chat-demo-search-item i{display:flex;align-items:center;gap:3px;color:#b66f18;font-size:11px;font-style:normal}.chat-demo-search-empty{padding:24px 12px;margin:0;text-align:center;color:var(--lobe-color-text-tertiary);font-size:12px}
      `}</style>
    </div>
  );

  return (
    <Popover content={content} trigger="click" open={open} onOpenChange={setOpen} placement="topLeft" styles={{ container: { padding: 4 } }}>
      <ActionIcon icon={Search} title="搜索并插入作品" size={{ blockSize: 32 }} active={open} />
    </Popover>
  );
}
