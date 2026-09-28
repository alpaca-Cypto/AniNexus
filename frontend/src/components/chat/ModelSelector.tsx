import React, { useEffect, useMemo } from 'react';
import { Select, Icon } from '@lobehub/ui';
import { useApiStore } from '@/store/useApiStore';
import { MODEL_LIST } from '@/store/models';
import { Settings2 } from 'lucide-react';

interface ModelSelectorProps {
  value: string; // 当前选中的模型ID
  onChange: (modelId: string, provider: string) => void; // 回调：同时返回模型ID和厂商ID
  onOpenSettings: () => void; // 如果没模型可用，引导去设置
  serverModel?: { configured: boolean; model: string; provider: string } | null;
}

export const ModelSelector = ({ value, onChange, onOpenSettings, serverModel }: ModelSelectorProps) => {
  // 1. 从 Store 获取所有配置
  const config = useApiStore((s) => s.config);

  // 2. 计算可用模型列表 (Derived State)
  const availableOptions = useMemo(() => {
    const models = [...MODEL_LIST];
    if (serverModel?.configured && !models.some((model) => model.id === serverModel.model)) {
      models.unshift({
        id: serverModel.model,
        name: serverModel.model,
        provider: serverModel.provider,
        icon: serverModel.provider,
      });
    }
    return models.filter((model) => {
      const providerConfig = config[model.provider as keyof typeof config];
      const isServerDefault = Boolean(
        serverModel?.configured
        && serverModel.model === model.id
        && serverModel.provider === model.provider,
      );
      return (
        isServerDefault
        || (providerConfig
          && providerConfig.enabled
          && (providerConfig.apiKey || model.provider === 'ollama'))
      );
    }).map((model) => ({
      label: (
        <div className="flex items-center gap-2 min-w-0">
          <Icon icon={model.icon} size={16} />
          <span className="flex-1 min-w-0 truncate">{model.name}</span>
          <span className="text-xs text-gray-400 ml-2 whitespace-nowrap">{model.provider}</span>
        </div>
      ),
      value: model.id,
      provider: model.provider,
    }));
  }, [config, serverModel]);

  // 3. 自动纠正逻辑：
  // 如果当前选中的模型（value）因为用户把 Key 删了而变得不可用，
  // 自动切换到列表里的第一个可用模型。
  useEffect(() => {
    if (availableOptions.length > 0) {
      const isCurrentValid = availableOptions.some(opt => opt.value === value);
      if (!isCurrentValid) {
        const first = availableOptions[0];
        onChange(first.value, first.provider);
      }
    }
  }, [availableOptions, onChange, value]);

  // 4. 空状态处理
  if (availableOptions.length === 0) {
    return (
      <button
        type="button"
        onClick={onOpenSettings}
        className="assistant-model-missing"
      >
        <Icon icon={Settings2} size={14} />
        <span>配置模型</span>
      </button>
    );
  }

  return (
    <Select
      value={value}
      options={availableOptions}
      onChange={(newValue) => {
         const modelMeta = availableOptions.find(model => model.value === newValue);
         if (modelMeta) {
             onChange(newValue, modelMeta.provider);
         }
      }}
      variant="borderless"
      className="assistant-model-select"
    />
  );
};
