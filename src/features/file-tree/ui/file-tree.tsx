"use client";

import { Tree } from "antd";
import type { TreeDataNode } from "antd";
import {
  FolderOutlined,
  FolderOpenOutlined,
  FileOutlined,
  TeamOutlined,
  SettingOutlined,
  BookOutlined,
  ThunderboltOutlined,
  UserOutlined,
  EnvironmentOutlined,
  ContainerOutlined,
  HistoryOutlined,
  CommentOutlined,
  CalendarOutlined,
} from "@ant-design/icons";
import type { Key } from "react";
import { useState } from "react";
import styles from "./file-tree.module.css";

const treeData: TreeDataNode[] = [
  {
    title: "masters",
    key: "masters",
    icon: ({ expanded }: { expanded?: boolean }) =>
      expanded ? <FolderOpenOutlined /> : <FolderOutlined />,
    children: [
      {
        title: "dnd-5e-faerun",
        key: "dnd-5e-faerun",
        icon: ({ expanded }: { expanded?: boolean }) =>
          expanded ? <FolderOpenOutlined /> : <FolderOutlined />,
        children: [
          {
            title: "sources",
            key: "sources",
            icon: ({ expanded }: { expanded?: boolean }) =>
              expanded ? <FolderOpenOutlined /> : <FolderOutlined />,
            children: [
              { title: "phb.pdf", key: "phb.pdf", icon: <FileOutlined /> },
              { title: "dmg.pdf", key: "dmg.pdf", icon: <FileOutlined /> },
              { title: "mm.pdf", key: "mm.pdf", icon: <FileOutlined /> },
            ],
          },
          {
            title: "rules",
            key: "rules",
            icon: ({ expanded }: { expanded?: boolean }) =>
              expanded ? <FolderOpenOutlined /> : <FolderOutlined />,
            children: [
              { title: "_index.md", key: "rules-index", icon: <FileOutlined /> },
              { title: "glossary.md", key: "glo", icon: <BookOutlined /> },
              {
                title: "races",
                key: "races",
                icon: ({ expanded }: { expanded?: boolean }) =>
                  expanded ? <FolderOpenOutlined /> : <FolderOutlined />,
                children: [
                  { title: "human.md", key: "human", icon: <FileOutlined /> },
                  { title: "elf.md", key: "elf", icon: <FileOutlined /> },
                  { title: "dwarf.md", key: "dwarf", icon: <FileOutlined /> },
                  { title: "halfling.md", key: "halfling", icon: <FileOutlined /> },
                ],
              },
              {
                title: "classes",
                key: "classes",
                icon: ({ expanded }: { expanded?: boolean }) =>
                  expanded ? <FolderOpenOutlined /> : <FolderOutlined />,
                children: [
                  { title: "fighter.md", key: "fighter", icon: <FileOutlined /> },
                  { title: "wizard.md", key: "wizard", icon: <FileOutlined /> },
                  { title: "rogue.md", key: "rogue", icon: <FileOutlined /> },
                  { title: "cleric.md", key: "cleric", icon: <FileOutlined /> },
                ],
              },
              {
                title: "mechanics",
                key: "mechanics",
                icon: ({ expanded }: { expanded?: boolean }) =>
                  expanded ? <FolderOpenOutlined /> : <FolderOutlined />,
                children: [
                  { title: "combat.md", key: "combat", icon: <FileOutlined /> },
                  { title: "skill-checks.md", key: "skill-checks", icon: <FileOutlined /> },
                  { title: "spellcasting.md", key: "spellcasting", icon: <FileOutlined /> },
                  { title: "conditions.md", key: "conditions", icon: <FileOutlined /> },
                ],
              },
              {
                title: "items",
                key: "items",
                icon: ({ expanded }: { expanded?: boolean }) =>
                  expanded ? <FolderOpenOutlined /> : <FolderOutlined />,
                children: [
                  { title: "weapons.md", key: "weapons", icon: <FileOutlined /> },
                  { title: "armor.md", key: "armor", icon: <FileOutlined /> },
                  { title: "magic-items.md", key: "magic-items", icon: <FileOutlined /> },
                ],
              },
              {
                title: "spells",
                key: "spells",
                icon: ({ expanded }: { expanded?: boolean }) =>
                  expanded ? <FolderOpenOutlined /> : <FolderOutlined />,
                children: [
                  { title: "cantrips.md", key: "cantrips", icon: <FileOutlined /> },
                  { title: "level-1.md", key: "level-1", icon: <FileOutlined /> },
                  { title: "level-2.md", key: "level-2", icon: <FileOutlined /> },
                ],
              },
            ],
          },
          {
            title: "templates",
            key: "templates",
            icon: ({ expanded }: { expanded?: boolean }) =>
              expanded ? <FolderOpenOutlined /> : <FolderOutlined />,
            children: [
              {
                title: "character-sheet.template.md",
                key: "char-template",
                icon: <FileOutlined />,
              },
              { title: "npc.template.md", key: "npc-template", icon: <FileOutlined /> },
            ],
          },
          {
            title: "skills",
            key: "skills",
            icon: ({ expanded }: { expanded?: boolean }) =>
              expanded ? <FolderOpenOutlined /> : <FolderOutlined />,
            children: [
              {
                title: "character-creation.md",
                key: "char-create",
                icon: <ThunderboltOutlined />,
              },
              {
                title: "combat-resolution.md",
                key: "combat-res",
                icon: <ThunderboltOutlined />,
              },
              { title: "skill-check.md", key: "skill-check", icon: <ThunderboltOutlined /> },
            ],
          },
          { title: "config.yaml", key: "config", icon: <SettingOutlined /> },
          { title: "formulas.yaml", key: "formulas", icon: <FileOutlined /> },
        ],
      },
    ],
  },
  {
    title: "sessions",
    key: "sessions",
    icon: ({ expanded }: { expanded?: boolean }) =>
      expanded ? <FolderOpenOutlined /> : <FolderOutlined />,
    children: [
      {
        title: "session-001",
        key: "session-001",
        icon: <CalendarOutlined />,
        children: [
          {
            title: "characters",
            key: "chars",
            icon: <TeamOutlined />,
            children: [
              {
                title: "garret",
                key: "garret",
                icon: <UserOutlined />,
                children: [
                  { title: "_base.md", key: "garret-base", icon: <FileOutlined /> },
                  { title: "_composition.yaml", key: "garret-comp", icon: <FileOutlined /> },
                  { title: "data.yaml", key: "garret-data", icon: <ContainerOutlined /> },
                ],
              },
              {
                title: "elen",
                key: "elen",
                icon: <UserOutlined />,
                children: [
                  { title: "_base.md", key: "elen-base", icon: <FileOutlined /> },
                  { title: "_composition.yaml", key: "elen-comp", icon: <FileOutlined /> },
                  { title: "data.yaml", key: "elen-data", icon: <ContainerOutlined /> },
                ],
              },
            ],
          },
          {
            title: "state",
            key: "state",
            icon: ({ expanded }: { expanded?: boolean }) =>
              expanded ? <FolderOpenOutlined /> : <FolderOutlined />,
            children: [
              { title: "scene.md", key: "scene", icon: <EnvironmentOutlined /> },
              { title: "effects.yaml", key: "effects", icon: <ThunderboltOutlined /> },
              { title: "summary.md", key: "summary", icon: <FileOutlined /> },
            ],
          },
          {
            title: "logs",
            key: "logs",
            icon: <HistoryOutlined />,
            children: [
              { title: "chat.md", key: "chat-log", icon: <CommentOutlined /> },
              { title: "events.md", key: "events-log", icon: <FileOutlined /> },
            ],
          },
        ],
      },
    ],
  },
];

export const FileTree = () => {
  const [selectedKeys, setSelectedKeys] = useState<Key[]>([]);

  return (
    <div className={styles.tree}>
      <Tree
        showIcon
        defaultExpandedKeys={[
          "masters",
          "dnd-5e-faerun",
          "sources",
          "rules",
          "races",
          "classes",
          "mechanics",
          "items",
          "templates",
          "skills",
          "sessions",
          "session-001",
          "chars",
          "garret",
          "elen",
          "state",
          "logs",
        ]}
        selectedKeys={selectedKeys}
        onSelect={(keys) => setSelectedKeys(keys)}
        treeData={treeData}
        blockNode
        selectable
      />
    </div>
  );
};
