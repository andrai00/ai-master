"use client";

import { Select, Spin } from "antd";
import type { SelectProps } from "antd";

interface IVirtualSelectProps extends SelectProps {
  loading?: boolean;
}

export function VirtualSelect({ loading, options, notFoundContent, ...props }: IVirtualSelectProps) {
  const showLoading = loading && (!options || options.length === 0);

  return (
    <Select
      {...props}
      options={options}
      listHeight={256}
      notFoundContent={showLoading ? <Spin size="small" /> : notFoundContent}
    />
  );
}
