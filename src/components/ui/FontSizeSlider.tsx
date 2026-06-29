import { SegmentSlider } from '@/components/ui/SegmentSlider';

interface FontSizeSliderProps {
  label: string;
  description?: string;
  options: readonly number[];
  value: number;
  onChange: (value: number) => void;
  unit?: string;
}

/**
 * 字体大小滑块 —— 基于 SegmentSlider 的薄封装。
 *
 * 沿长胶囊轨道拖拽或点击切换预设字号，每个节点下方显示对应取值。
 * 保留旧导出 API 以兼容 Settings 页面调用。
 */
export function FontSizeSlider({
  label,
  description,
  options,
  value,
  onChange,
  unit = 'px',
}: FontSizeSliderProps) {
  return (
    <SegmentSlider
      label={label}
      description={description}
      options={options}
      value={value}
      onChange={onChange}
      unit={unit}
      accent="blue"
      showValueLabels
      formatValue={(v) => `${v}${unit}`}
    />
  );
}
