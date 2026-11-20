import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { Globe } from "lucide-react";
import { zhTranslations } from "./zh";

export type Language = "zh" | "en";

const storageKey = "owpengram.admin.language";

// Whole-string lookup first. The panel renders mostly self-contained labels,
// so matching the exact text node (or placeholder/title attribute) is enough
// for the overwhelming majority of the interface and avoids touching any
// component. Dynamic counts and identifiers are handled by the patterns below.
const dictionary = new Map<string, string>();
for (const [english, chinese] of Object.entries(zhTranslations)) {
  dictionary.set(normalizeKey(english), chinese);
}

const patterns: Array<[RegExp, string]> = [
  [/^API layers: (.+)$/, "API 层：$1"],
  [/^Layers: (.+)$/, "层级：$1"],
  [/^Build: (.+)$/, "构建：$1"],
  [/^Version: (.+)$/, "版本：$1"],
  [/^Last (\d+) audit rows$/, "最近 $1 条审计记录"],
  [/^Showing (\d+)-(\d+) of (\d+)$/, "显示 $1–$2 / 共 $3"],
  [/^Showing (\d+) of (\d+)$/, "显示 $1 / $2"],
  [/^Page (\d+) of (\d+)$/, "第 $1 / $2 页"],
  [/^(\d+) authorizations$/, "$1 个授权设备"],
  [/^Account #(\d+)$/, "账号 #$1"],
  [/^Application #(\d+)$/, "申请 #$1"],
  [/^Open account (\d+)$/, "打开账号 $1"],
  [/^Remove (\d+)$/, "移除 $1"],
  [/^Amount \((.+)\)$/, "金额（$1）"],
  [/^Crypto amount \((.+)\)$/, "加密货币金额（$1）"],
  [/^Create sticker pack$/, "创建贴纸包"],
  [/^Create emoji pack$/, "创建表情包"],
  [/^Create (.+) pack$/, "创建 $1 包"],
  [/^(\d+) options$/, "$1 个选项"],
  [/^of (.+)$/, "共 $1"],
  [/^(\d+) accounts?$/, "$1 个账号"],
  [/^(\d+) users?$/, "$1 个用户"],
  [/^(\d+) bots?$/, "$1 个机器人"],
  [/^(\d+) channels?$/, "$1 个频道"],
  [/^(\d+) devices?$/, "$1 台设备"],
  [/^(\d+) messages?$/, "$1 条消息"],
  [/^(\d+) files?$/, "$1 个文件"],
  [/^(\d+) rows?$/, "$1 行"],
  [/^(\d+) days?$/, "$1 天"],
  [/^(\d+) hours?$/, "$1 小时"],
  [/^(\d+) minutes?$/, "$1 分钟"],
  [/^(\d+) seconds?$/, "$1 秒"],
  [/^(\d+) selected$/, "已选 $1 项"],
  [/^(\d+) setting\(s\) across (\d+) group\(s\)\. Changes take effect on the next Restart\/Update\.$/, "$1 项设置，分布在 $2 个分组。更改将在下次重启/更新后生效。"],
  [/^(\d+) setting\(s\)\. Changes take effect on the next Restart\/Update\.$/, "$1 项设置。更改将在下次重启/更新后生效。"],
  [/^(\d+) fields?$/, "$1 个字段"],
  [/^(\d+) groups?$/, "$1 个分组"],
  [/^(\d+) settings?$/, "$1 项设置"],
  [/^(\w+) backend$/, "$1 后端"],
  [/^Supergroup #(\d+)$/, "超级群组 #$1"],
  [/^Channel #(\d+)$/, "频道 #$1"],
  [/^Bot #(\d+)$/, "机器人 #$1"],
  [/^Creator (\d+)$/, "创建者 $1"],
  [/^(\d+) \/ Admins (\d+)$/, "$1 / 管理员 $2"],
  [/^Banned (\d+) \/ Kicked (\d+)$/, "封禁 $1 / 踢出 $2"],
  [/^(.* · )last active (.+)$/, "$1最后活跃 $2"],
  [/^support=(true|false) bot=(true|false)$/, "支持=$1 机器人=$2"],
  [/^Update \((\d+)\)$/, "更新 ($1)"],
  [/^(\d+) new commits? pulled from GitHub\.$/, "已从 GitHub 拉取 $1 个新提交。"],
  [/^Must contain \{\{code\}\} exactly once -- it currently appears (\d+) times\.$/, "必须包含 {{code}} 且只能出现一次——当前出现了 $1 次。"],
  [/^pid (\d+)$/, "进程 $1"]
];

const translatableAttributes = ["title", "placeholder", "aria-label", "alt"] as const;

let activeLanguage: Language = "zh";
let observer: MutationObserver | null = null;
let frame = 0;
const pendingRoots = new Set<Node>();

// Per-node originals let the switch be a true toggle: English is restored
// byte-for-byte, including the whitespace JSX inserts around labels.
const originalText = new WeakMap<Text, string>();
const appliedText = new WeakMap<Text, string>();
const textNodes = new Set<Text>();
const originalAttrs = new WeakMap<Element, Map<string, { original: string; applied: string }>>();
const attrElements = new Set<Element>();

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function normalizeKey(value: string): string {
  return decodeEntities(value).replace(/\s+/g, " ").trim();
}

function translatePhrase(value: string): string | null {
  const key = normalizeKey(value);
  if (!key) return null;
  const direct = dictionary.get(key);
  if (direct !== undefined) return direct;
  for (const [pattern, replacement] of patterns) {
    if (pattern.test(key)) return key.replace(pattern, replacement);
  }
  return null;
}

// Text nodes are usually wrapped in JSX indentation; keeping that whitespace
// avoids moving labels into their neighbour or losing a leading space before
// an inline icon.
function translateWithWhitespace(value: string): string | null {
  const match = value.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!match) return null;
  const translated = translatePhrase(match[2]);
  if (translated === null) return null;
  return match[1] + translated + match[3];
}

function isTextSkipped(element: Element | null): boolean {
  let node: Element | null = element;
  while (node && node !== document.body && node !== document.documentElement) {
    if (node.hasAttribute("data-no-i18n")) return true;
    if (node.getAttribute("contenteditable") === "true") return true;
    switch (node.tagName) {
      case "SCRIPT":
      case "STYLE":
      case "NOSCRIPT":
      case "CODE":
      case "PRE":
      case "SVG":
      case "TEXTAREA":
        return true;
      default:
        break;
    }
    node = node.parentElement;
  }
  return false;
}

function isAttrSkipped(element: Element | null): boolean {
  let node: Element | null = element;
  while (node && node !== document.body && node !== document.documentElement) {
    if (node.hasAttribute("data-no-i18n")) return true;
    switch (node.tagName) {
      case "SCRIPT":
      case "STYLE":
      case "NOSCRIPT":
      case "SVG":
        return true;
      default:
        break;
    }
    node = node.parentElement;
  }
  return false;
}

function translateTextNode(node: Text): void {
  if (!node.isConnected || isTextSkipped(node.parentElement)) return;
  const current = node.nodeValue ?? "";
  if (!current) return;
  textNodes.add(node);

  if (activeLanguage === "en") {
    const original = originalText.get(node);
    const applied = appliedText.get(node);
    if (original !== undefined && applied !== undefined && current === applied) {
      node.nodeValue = original;
    }
    return;
  }

  const previous = appliedText.get(node);
  let original = originalText.get(node);
  // React replaces the text when its props change. A different value means the
  // stored original is stale, so it becomes the new English source.
  if (original === undefined || current !== previous) {
    original = current;
    originalText.set(node, original);
  }
  if (current === previous) return;

  const translated = translateWithWhitespace(original);
  if (translated !== null && translated !== current) {
    node.nodeValue = translated;
    appliedText.set(node, translated);
  }
}

function translateElementAttributes(element: Element): void {
  if (isAttrSkipped(element)) return;
  attrElements.add(element);
  let records = originalAttrs.get(element);
  if (!records) {
    records = new Map();
    originalAttrs.set(element, records);
  }

  for (const name of translatableAttributes) {
    const current = element.getAttribute(name);
    if (current === null || !current.trim()) continue;
    const record = records.get(name);

    if (activeLanguage === "en") {
      if (record && current === record.applied) {
        element.setAttribute(name, record.original);
      }
      continue;
    }

    if (record && current === record.applied) continue;
    const translated = translateWithWhitespace(current);
    if (translated !== null && translated !== current) {
      records.set(name, { original: current, applied: translated });
      element.setAttribute(name, translated);
    }
  }
}

function translateRoot(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root as Text);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const element = root as Element;
  if (isAttrSkipped(element)) return;
  translateElementAttributes(element);

  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE && isTextSkipped(node as Element)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === Node.TEXT_NODE) {
      translateTextNode(node as Text);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      translateElementAttributes(node as Element);
    }
  }
}

function schedule(root: Node): void {
  pendingRoots.add(root);
  if (frame) return;
  frame = window.requestAnimationFrame(() => {
    frame = 0;
    const roots = [...pendingRoots];
    pendingRoots.clear();
    for (const next of roots) {
      if (next.isConnected) translateRoot(next);
    }
  });
}

function startTranslator(): void {
  if (observer || !document.body) return;
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        schedule(mutation.target);
      } else if (mutation.type === "attributes") {
        translateElementAttributes(mutation.target as Element);
      } else {
        mutation.addedNodes.forEach(schedule);
      }
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...translatableAttributes]
  });
  translateRoot(document.body);
}

function stopTranslator(): void {
  observer?.disconnect();
  observer = null;
  if (frame) {
    window.cancelAnimationFrame(frame);
    frame = 0;
  }
  pendingRoots.clear();
}

function applyLanguage(language: Language): void {
  activeLanguage = language;
  for (const node of [...textNodes]) {
    if (!node.isConnected) {
      textNodes.delete(node);
      continue;
    }
    translateTextNode(node);
  }
  for (const element of [...attrElements]) {
    if (!element.isConnected) {
      attrElements.delete(element);
      continue;
    }
    translateElementAttributes(element);
  }
  if (language === "zh" && document.body) {
    translateRoot(document.body);
  }
}

export function translatePlainText(value: string): string {
  if (activeLanguage !== "zh") return value;
  return translateWithWhitespace(value) ?? value;
}

function initialLanguage(): Language {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === "zh" || stored === "en") return stored;
  } catch {
    // Storage is optional.
  }
  // The reference deployment is operated in Chinese; the switch restores
  // English for anyone who prefers it.
  return "zh";
}

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => initialLanguage());

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      // Persistence is best-effort.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    // Login and setup screens do not have the Shell's brand-aware title
    // effect, so the tab must follow the switch here too.
    if (language === "zh" && document.title.endsWith(" Admin")) {
      document.title = document.title.slice(0, -" Admin".length) + " 管理后台";
    } else if (language === "en" && document.title.endsWith(" 管理后台")) {
      document.title = document.title.slice(0, -" 管理后台".length) + " Admin";
    }
    applyLanguage(language);
  }, [language]);

  useEffect(() => {
    startTranslator();
    return stopTranslator;
  }, []);

  // Native confirm() boxes are outside the DOM, so they need their own bridge.
  useEffect(() => {
    const original = window.confirm;
    if (language !== "zh") return;
    window.confirm = (message?: string) =>
      original(message === undefined ? undefined : translatePlainText(String(message)));
    return () => {
      window.confirm = original;
    };
  }, [language]);

  const value = useMemo<I18nContextValue>(() => ({ language, setLanguage }), [language, setLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}

export function LanguageSwitch() {
  const { language, setLanguage } = useI18n();
  const next = language === "zh" ? "en" : "zh";
  const label = language === "zh" ? "Switch to English" : "切换到中文";
  return (
    <button
      className="theme-toggle lang-toggle"
      type="button"
      onClick={() => setLanguage(next)}
      aria-label={label}
      title={label}
    >
      <Globe size={16} />
      <span>{language === "zh" ? "EN" : "中文"}</span>
    </button>
  );
}
