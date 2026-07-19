"use client";

import { Layout } from "antd";
import {
  CommentOutlined,
  HistoryOutlined,
  IdcardOutlined,
  BookOutlined,
  MenuOutlined,
} from "@ant-design/icons";
import { useState, useEffect, useCallback, type ReactNode } from "react";
import { Sidebar } from "@/src/widgets/sidebar";
import { ChatPanel } from "@/src/features/chat-panel";
import { MdViewer } from "@/src/features/md-viewer";
import styles from "./shell.module.css";

const { Content } = Layout;
const MOBILE_BREAKPOINT = 768;

const shortChat = [
  { id: 1, sender: "Мастер", role: "master" as const, text: "Вы входите в таверну «Сломанная стрела». Внутри полумрак, пахнет элем и жареным мясом." },
  { id: 2, sender: "Гаррет", role: "player" as const, text: "Осматриваюсь. Есть кто подозрительный?" },
  { id: 3, sender: "Мастер", role: "master" as const, text: "За дальним столом трое гоблинов что-то бурно обсуждают. Бармен протирает кружки, искоса поглядывая на вас." },
];

const masterLines = [
  "Вы входите в таверну. За стойкой бармен, в углу трое гоблинов.",
  "Гоблины замолкают и смотрят на вас. Один из них тянется к ножу.",
  null,
  "Бармен нервно кашляет и отходит в подсобку.",
  "Бросай инициативу.",
  null,
  "Гоблин 1 хватает нож и вскакивает на стол. Гоблин 2 и 3 отходят к стене.",
  "Твой ход. Что делаешь?",
  null,
  "Ты попадаешь! Гоблин 1 получает 6 урона. Он шатается, но держится на ногах.",
  null,
  "Гоблин 2 кидает в тебя кружкой — промах. Гоблин 3 пытается убежать через чёрный ход.",
  "Бармен выглядывает из подсобки: «Только не разнесите мне таверну!»",
  null,
  "Ты перехватываешь гоблина у двери. Он в панике.",
  "С улицы доносится свист городской стражи. Похоже, кто-то их вызвал.",
  null,
  "Гоблин 3 сдаётся. Гоблин 1 всё ещё на столе, но уже не выглядит угрожающе.",
  "Стража входит в таверну. Сержант: «Что здесь происходит?»",
  null,
  "Гоблинов уводят. Бармен благодарит вас и предлагает бесплатную выпивку.",
  "Вы получаете 50XP за разрешение конфликта без лишнего кровопролития.",
];
const playerLines = ["Я обнажаю короткий меч.", "Атакую гоблина 1.", "Бегу к чёрному ходу — перехватить гоблина.", "Говорю сержанту: «Это была самооборона, они первые полезли.»"];

const longChat = masterLines.map((line, i) => {
  if (line === null) {
    return { id: i + 1, sender: "Гаррет", role: "player" as const, text: playerLines[i % 4] };
  }
  return { id: i + 1, sender: "Мастер", role: "master" as const, text: line };
});

interface ITab {
  key: string;
  icon: ReactNode;
  label: string;
  content: ReactNode;
}

const tabs: ITab[] = [
  {
    key: "chat", icon: <CommentOutlined />, label: "Общий чат",
    content: <ChatPanel messages={shortChat} placeholder="Введите сообщение..." />,
  },
  {
    key: "history", icon: <HistoryOutlined />, label: "История",
    content: <ChatPanel messages={longChat} placeholder="Введите сообщение..." />,
  },
  {
    key: "sheet", icon: <IdcardOutlined />, label: "Гаррет",
    content: (
      <MdViewer>
        <h1>Гаррет — полурослик-плут, 3 уровень</h1>
        <p><strong>HP:</strong> 38 / 45 &nbsp;|&nbsp; <strong>КД:</strong> 15 &nbsp;|&nbsp; <strong>Скорость:</strong> 25 фт.</p>
        <hr />
        <h2>Характеристики</h2>
        <table><thead><tr><th>Хар-ка</th><th>Значение</th><th>Модификатор</th></tr></thead>
          <tbody>
            <tr><td>Сила</td><td>8</td><td>-1</td></tr>
            <tr><td>Ловкость</td><td>18</td><td>+4</td></tr>
            <tr><td>Телосложение</td><td>14</td><td>+2</td></tr>
            <tr><td>Интеллект</td><td>12</td><td>+1</td></tr>
            <tr><td>Мудрость</td><td>10</td><td>0</td></tr>
            <tr><td>Харизма</td><td>14</td><td>+2</td></tr>
          </tbody>
        </table>
        <h2>Навыки</h2>
        <ul><li><strong>Скрытность</strong> +8</li><li><strong>Акробатика</strong> +7</li><li><strong>Ловкость рук</strong> +7</li><li><strong>Восприятие</strong> +3</li><li><strong>Обман</strong> +5</li></ul>
        <h2>Инвентарь</h2>
        <ul><li>Короткий меч — 1d6 piercing</li><li>Кожаный доспех — КД 11</li><li>Зелье лечения (3 шт.)</li><li>Воровские инструменты</li><li>45 золотых</li></ul>
      </MdViewer>
    ),
  },
  {
    key: "rules", icon: <BookOutlined />, label: "Боевые правила",
    content: (
      <MdViewer>
        <h1>Боевые правила D&D 5e</h1>
        <p>Полный свод правил ведения боя из <em>Player's Handbook</em>, глава 9.</p>
        <h2>1. Порядок хода</h2>
        <p>В начале боя все участники совершают <strong>проверку инициативы</strong> — бросок d20 + модификатор Ловкости. Порядок определяется от наибольшего результата к наименьшему.</p>
        <h2>2. Действия в ход</h2>
        <p>В свой ход персонаж может совершить:</p>
        <ul><li><strong>Основное действие</strong> — атака, применение заклинания, рывок, отход, уклонение, помощь, засада, поиск, использование предмета.</li><li><strong>Бонусное действие</strong> — если способность или заклинание явно это разрешает.</li><li><strong>Передвижение</strong> — до значения скорости персонажа.</li><li><strong>Реакция</strong> — одна за раунд.</li></ul>
        <h2>3. Бросок атаки</h2>
        <p>d20 + модификатор атаки (характеристика + бонус мастерства). <strong>Равен или превышает КД</strong> — попадание.</p>
        <h2>4. Урон и сопротивление</h2>
        <p>При попадании бросается урон оружия/заклинания + модификатор характеристики.</p>
        <blockquote>Короткий меч: 1d6 + СИЛ (или ЛОВ для finesse). Атака 18 против КД 15 → урон 1d6+4.</blockquote>
        <h2>5. Критические попадания и промахи</h2>
        <p><strong>Крит (20):</strong> двойной куб урона. <strong>Промах (1):</strong> автоматический промах.</p>
        <h2>6. Состояния в бою</h2>
        <table><thead><tr><th>Состояние</th><th>Эффект</th></tr></thead>
          <tbody>
            <tr><td>Ослеплён</td><td>Автопровал проверок зрения. Атаки по нему — с преимуществом, его — с помехой.</td></tr>
            <tr><td>Очарован</td><td>Не может атаковать очаровавшего.</td></tr>
            <tr><td>Испуган</td><td>Помеха на проверки и атаки пока источник в поле зрения.</td></tr>
            <tr><td>Схвачен</td><td>Скорость 0.</td></tr>
            <tr><td>Недееспособен</td><td>Не может совершать действия и реакции.</td></tr>
            <tr><td>Невидим</td><td>Атаки с преимуществом, по нему — с помехой.</td></tr>
            <tr><td>Парализован</td><td>Недееспособен + автопровал СИЛ/ЛОВ. Атаки в упор — критические.</td></tr>
            <tr><td>Отравлен</td><td>Помеха на броски атаки и проверки.</td></tr>
            <tr><td>Сбит с ног</td><td>Только ползти. Помеха на атаки.</td></tr>
            <tr><td>Обездвижен</td><td>Скорость 0.</td></tr>
            <tr><td>Ошеломлён</td><td>Недееспособен + автопровал СИЛ/ЛОВ.</td></tr>
            <tr><td>Без сознания</td><td>Недееспособен + всё роняет + падает.</td></tr>
          </tbody>
        </table>
        <h2>7. Укрытие</h2>
        <p>Половина: +2 КД. Три четверти: +5. Полное: нельзя атаковать.</p>
        <h2>8. Смерть и стабилизация</h2>
        <p>HP = 0 → спасбросок смерти (d20, СЛ 10). 3 успеха = стабилизация. 3 провала = смерть. 20 = 1 HP. 1 = 2 провала.</p>
        <h2>9. Лечение</h2>
        <p>Заклинания, зелья, способности. Короткий отдых: кости хитов. Длинный отдых: полное восстановление.</p>
      </MdViewer>
    ),
  },
];

export const Shell = () => {
  const [activeTab, setActiveTab] = useState("chat");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!isMobile) setMobileOpen(false);
  }, [isMobile]);

  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setMobileOpen((v) => !v);
    } else {
      setSidebarCollapsed((v) => !v);
    }
  }, [isMobile]);

  const activeContent = tabs.find((t) => t.key === activeTab)?.content;

  return (
    <Layout className={styles.shell}>
      {isMobile && mobileOpen && (
        <div className={styles.overlay} onClick={() => setMobileOpen(false)} />
      )}

      {isMobile ? (
        <div className={`${styles.mobileDrawer} ${mobileOpen ? styles.mobileDrawerOpen : ""}`}>
          <Sidebar collapsed={false} onToggle={toggleSidebar} />
        </div>
      ) : (
        <Layout.Sider
          collapsed={sidebarCollapsed}
          collapsedWidth={48}
          width={266}
          className={styles.sider}
          trigger={null}
        >
          <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
        </Layout.Sider>
      )}

      <Content className={styles.content}>
        {isMobile && !mobileOpen && (
          <button className={styles.mobileMenuBtn} onClick={toggleSidebar}>
            <MenuOutlined />
          </button>
        )}

        <div className={styles.tabBar}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`${styles.tab} ${tab.key === activeTab ? styles.tabActive : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className={styles.tabBody}>
          {activeContent}
        </div>
      </Content>
    </Layout>
  );
};
