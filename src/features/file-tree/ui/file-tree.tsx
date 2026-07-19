"use client";

import {
  IdcardOutlined,
  ContainerOutlined,
  ThunderboltOutlined,
  BookOutlined,
  CompassOutlined,
  TeamOutlined,
  EnvironmentOutlined,
  RocketOutlined,
} from "@ant-design/icons";
import type { ReactNode } from "react";
import styles from "./file-tree.module.css";

interface ITreeSection {
  label: string;
  items: ITreeItem[];
}

interface ITreeItem {
  key: string;
  icon: ReactNode;
  label: string;
}

const treeSections: ITreeSection[] = [
  {
    label: "Мой персонаж",
    items: [
      { key: "sheet", icon: <IdcardOutlined />, label: "Гаррет (лист)" },
      { key: "inventory", icon: <ContainerOutlined />, label: "Инвентарь" },
      { key: "effects", icon: <ThunderboltOutlined />, label: "Эффекты" },
    ],
  },
  {
    label: "Шпаргалки",
    items: [
      { key: "combat-actions", icon: <BookOutlined />, label: "Боевые ходы" },
      { key: "conditions", icon: <BookOutlined />, label: "Состояния" },
      { key: "skill-checks", icon: <BookOutlined />, label: "Проверки" },
    ],
  },
  {
    label: "Общие листы",
    items: [
      { key: "ship", icon: <RocketOutlined />, label: "Корабль «Морской волк»" },
      { key: "party-loot", icon: <ContainerOutlined />, label: "Общий инвентарь" },
    ],
  },
  {
    label: "Текущая сцена",
    items: [
      { key: "scene", icon: <EnvironmentOutlined />, label: "Таверна (бой)" },
      { key: "initiative", icon: <CompassOutlined />, label: "Порядок хода" },
    ],
  },
];

export const FileTree = () => {
  return (
    <div className={styles.tree}>
      {treeSections.map((section) => (
        <div key={section.label} className={styles.section}>
          <div className={styles.sectionHeader}>{section.label}</div>
          {section.items.map((item) => (
            <button key={item.key} className={styles.item}>
              <span className={styles.itemIcon}>{item.icon}</span>
              <span className={styles.itemLabel}>{item.label}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
};
