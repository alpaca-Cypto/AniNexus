'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, LoaderCircle, RefreshCw } from 'lucide-react';
import { Alert, Button, Checkbox, Input, Modal, Popconfirm, Select } from 'antd';
import { toast } from '@lobehub/ui';
import CollectionHeader from '@/components/header/CollectionHeader';
import CollectionContent from '@/components/collection/CollectionContent';
import { COLLECTIONS_UPDATED_EVENT, collectionService, type BangumiTokenStatus } from '@/services/collections';
import type { SearchResult } from '@/services/search';
import './collection-page.css';

const subjectTypes: Record<string, number | undefined> = { all: undefined, books: 1, anime: 2, games: 4, real: 6 };
const collectionStatuses: Record<string, number | undefined> = { all: undefined, watching: 3, planned: 1, on_hold: 4, completed: 2 };
const PAGE_SIZE = 100;

export default function CollectionPage() {
  const [searchKw, setSearchKw] = useState('');
  const [filterValue, setFilterValue] = useState('all');
  const [statusValue, setStatusValue] = useState('all');
  const [sortBy, setSortBy] = useState('updated_at');
  const [collections, setCollections] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [requestVersion, setRequestVersion] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [importToken, setImportToken] = useState('');
  const [tokenStatus, setTokenStatus] = useState<BangumiTokenStatus | null>(null);
  const [tokenStatusLoading, setTokenStatusLoading] = useState(false);
  const [rememberToken, setRememberToken] = useState(true);
  const [importSubjectType, setImportSubjectType] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');

  const closeImport = () => {
    if (importing) return;
    setImportOpen(false);
    setImportToken('');
    setImportError('');
  };

  useEffect(() => {
    if (!importOpen) return;
    let active = true;
    queueMicrotask(() => setTokenStatusLoading(true));
    void collectionService.getBangumiTokenStatus()
      .then((status) => { if (active) setTokenStatus(status); })
      .catch((error) => {
        if (active) setImportError(error instanceof Error ? error.message : '无法读取已保存的 Token。');
      })
      .finally(() => { if (active) setTokenStatusLoading(false); });
    return () => { active = false; };
  }, [importOpen]);

  const importFromBangumi = async () => {
    const token = importToken.trim();
    if (!token && !tokenStatus?.configured) {
      setImportError('请先输入 Bangumi Access Token。');
      return;
    }
    setImporting(true);
    setImportError('');
    try {
      if (token && rememberToken) {
        const status = await collectionService.saveBangumiToken(token);
        setTokenStatus(status);
      }
      const result = await collectionService.importBangumi(token && !rememberToken ? token : null, importSubjectType);
      setImporting(false);
      closeImport();
      setPage(0);
      setRequestVersion((value) => value + 1);
      window.dispatchEvent(new Event(COLLECTIONS_UPDATED_EVENT));
      toast.success({ title: 'Bangumi 导入完成', description: `已从 ${result.username} 导入 ${result.import_count} 条收藏。` });
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '导入失败，请稍后重试。');
      setImporting(false);
    }
  };

  const removeSavedToken = async () => {
    try {
      await collectionService.deleteBangumiToken();
      setTokenStatus({ configured: false, username: null });
      toast.success('已删除保存的 Bangumi Token');
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '删除失败，请稍后重试。');
    }
  };

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (page === 0) setIsLoading(true);
      else setLoadingMore(true);
      setLoadError('');
    });
    void collectionService.getCollections({
      subject_type: subjectTypes[filterValue],
      status: collectionStatuses[statusValue],
      keyword: searchKw.trim() || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      sort_by: sortBy,
    }).then((response) => {
      if (active) {
        setTotal(response.total);
        setCollections((current) => page === 0 ? response.items : [...current, ...response.items]);
      }
    }).catch(() => {
      if (!active) return;
      if (page === 0) setCollections([]);
      setLoadError(page === 0
        ? '暂时无法加载收藏库，请检查登录状态或后端服务。'
        : '后续收藏加载失败，请重试。');
    }).finally(() => {
      if (active) {
        setIsLoading(false);
        setLoadingMore(false);
      }
    });
    return () => { active = false; };
  }, [filterValue, page, requestVersion, searchKw, sortBy, statusValue]);

  return (
    <div className="nexus-workspace-page flex h-full flex-col overflow-hidden">
      <div className="z-10 flex-none">
        <CollectionHeader
          onImportBangumi={() => setImportOpen(true)}
          onSearch={(value) => { setPage(0); setSearchKw(value); }}
          filterValue={filterValue}
          onFilterChange={(value) => { setPage(0); setFilterValue(value); }}
          statusValue={statusValue}
          onStatusChange={(value) => { setPage(0); setStatusValue(value); }}
          onSortChange={(value) => { setPage(0); setSortBy(value); }}
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="collection-page-state" role="status">
            <LoaderCircle className="collection-page-state__spinner" size={28} />
            <h2>正在加载收藏库</h2>
            <p>正在读取你的作品与收藏状态。</p>
          </div>
        ) : loadError && page === 0 ? (
          <div className="collection-page-state collection-page-state--error" role="alert">
            <AlertCircle size={30} />
            <h2>收藏库加载失败</h2>
            <p>{loadError}</p>
            <button onClick={() => setRequestVersion((value) => value + 1)} type="button">
              <RefreshCw size={16} />重新加载
            </button>
          </div>
        ) : (
          <>
            <CollectionContent
              emptyDescription={searchKw || filterValue !== 'all' || statusValue !== 'all' ? '没有匹配当前条件的收藏' : '还没有收藏作品'}
              items={collections}
            />
            {loadError && <p role="alert" className="collection-page-load-error">{loadError}</p>}
            {collections.length < total && (
              <button
                className="collection-page-load-more"
                disabled={loadingMore}
                onClick={() => loadError ? setRequestVersion((value) => value + 1) : setPage((value) => value + 1)}
                type="button"
              >
                {loadingMore ? '正在加载…' : loadError ? '重试加载' : `加载更多（${collections.length}/${total}）`}
              </button>
            )}
          </>
        )}
      </div>
      <Modal
        title="从 Bangumi 导入收藏"
        open={importOpen}
        onCancel={closeImport}
        footer={[
          <Button key="cancel" onClick={closeImport} disabled={importing}>取消</Button>,
          <Button key="import" type="primary" onClick={() => void importFromBangumi()} loading={importing} disabled={tokenStatusLoading}>开始导入</Button>,
        ]}
        closable={!importing}
        maskClosable={!importing}
        destroyOnHidden
      >
        <div className="collection-import-form">
          <p>使用你自己的 Bangumi Access Token 导入收藏。保存后下次可直接导入。</p>
          {tokenStatus?.configured && (
            <div>
              <Alert type="success" showIcon message={`已保存 ${tokenStatus.username} 的 Bangumi Token`} />
              <Popconfirm title="删除已保存的 Token？" onConfirm={() => void removeSavedToken()} okText="删除" cancelText="取消">
                <Button type="link" danger disabled={importing}>删除已保存的 Token</Button>
              </Popconfirm>
            </div>
          )}
          <a href="https://bgm.tv/dev/app" target="_blank" rel="noopener noreferrer">在 Bangumi 获取 Access Token</a>
          <label htmlFor="bangumi-import-token">{tokenStatus?.configured ? '替换 Access Token（可留空）' : 'Access Token'}</label>
          <Input.Password id="bangumi-import-token" value={importToken} onChange={(event) => setImportToken(event.target.value)} autoComplete="off" disabled={importing} placeholder={tokenStatus?.configured ? '留空则使用已保存的 Token' : '粘贴 Bangumi Access Token'} />
          {importToken && <Checkbox checked={rememberToken} onChange={(event) => setRememberToken(event.target.checked)} disabled={importing}>保存 Token，下次免输入</Checkbox>}
          <label htmlFor="bangumi-import-type">导入范围</label>
          <Select id="bangumi-import-type" value={importSubjectType} onChange={setImportSubjectType} disabled={importing} options={[{ value: null, label: '全部收藏' }, { value: 2, label: '仅动画' }]} />
          {importError && <Alert type="error" showIcon message={importError} role="alert" />}
        </div>
      </Modal>
    </div>
  );
}
