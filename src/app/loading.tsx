import { Spin } from "antd";

export default function Loading() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "var(--bg-root)",
        gap: 16,
      }}
    >
      <Spin size="large" />
      <span style={{ color: "var(--text-dim)", fontSize: 13 }}>ai-master</span>
    </div>
  );
}
