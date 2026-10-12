export type Source = {
  id: string;
  name: string;
  url: string;
  active: boolean;
  lastCheckedAt: string;
  articleCount: number;
};
export type ArticleStatus = "new" | "processed" | "failed";
export type Article = {
  id: string;
  sourceId: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  status: ArticleStatus;
  starred?: boolean;
  content: string;
  createdAt: string;
};
export type ScriptScene = {
  durationSeconds: number;
  narration: string;
  visuals: string;
  onScreenText: string;
};
export type Script = {
  id: string;
  articleId: string;
  title: string;
  source: string;
  hook: string;
  summary: string;
  keyPoints: string[];
  script: string;
  status: "generated";
  starred?: boolean;
  generatedAt: string;
  format?: "video-ready-v1";
  scenes?: ScriptScene[];
  durationSeconds?: number;
  productionNotes?: string;
};

export const sources: Source[] = [
  ["Reuters", "https://www.reuters.com/", true, "Today, 12:00 PM", 24],
  ["TechCrunch", "https://techcrunch.com/", true, "Today, 12:00 PM", 18],
  ["The Verge", "https://www.theverge.com/", false, "Yesterday, 9:00 PM", 12],
  [
    "The Information",
    "https://www.theinformation.com/",
    true,
    "Today, 12:00 PM",
    16,
  ],
  ["Ars Technica", "https://arstechnica.com/", true, "Today, 12:00 PM", 14],
  ["Bloomberg", "https://www.bloomberg.com/", true, "Today, 12:00 PM", 21],
  [
    "The Guardian",
    "https://www.theguardian.com/",
    false,
    "Yesterday, 9:00 PM",
    9,
  ],
  ["Wired", "https://www.wired.com/", true, "Today, 12:00 PM", 10],
].map((x, i) => ({
  id: `source-${i + 1}`,
  name: x[0] as string,
  url: x[1] as string,
  active: x[2] as boolean,
  lastCheckedAt: x[3] as string,
  articleCount: x[4] as number,
}));

const titles = [
  "OpenAI announces new AI model",
  "Apple expands satellite emergency features",
  "The next wave of climate tech investment",
  "Google reveals new developer tools",
  "EU advances landmark technology rules",
  "Semiconductor demand reaches record high",
  "Why smaller models are changing enterprise AI",
  "The future of work is becoming more flexible",
  "New battery breakthrough promises faster charging",
  "Global markets respond to rate decision",
  "Streaming platforms rethink their business models",
  "Cybersecurity teams prepare for new threat",
  "Researchers map a path to cleaner aviation",
  "A new generation of robotics enters factories",
  "What the latest chips mean for consumers",
  "Cities test smarter public transit systems",
  "The creator economy finds a second wind",
  "Retailers invest in predictive logistics",
  "Scientists make progress on fusion energy",
  "The quiet rise of open source software",
];
export const articles: Article[] = titles.map((title, i) => ({
  id: `article-${i + 1}`,
  sourceId: `source-${(i % 8) + 1}`,
  title,
  source: sources[i % 8].name,
  url: "https://example.com/article",
  publishedAt: i < 5 ? "Today · 11:42 AM" : `Sep ${15 - (i % 8)}, 2026`,
  status: i % 7 === 0 ? "new" : i === 9 ? "failed" : "processed",
  content: `${title} marks another important development for the technology and business landscape. The announcement brings together new research, market context, and practical implications for organizations and consumers. This preview represents the extracted article content that a future ingestion service will provide.`,
  createdAt: i < 5 ? "Today · 12:02 PM" : `Sep ${15 - (i % 8)}, 2026`,
}));
export const scripts: Script[] = articles.slice(0, 10).map((a, i) => ({
  id: `script-${i + 1}`,
  articleId: a.id,
  title: a.title,
  source: a.source,
  hook: `${a.title} could change how people and businesses think about what comes next.`,
  summary: `${a.title} introduces a meaningful shift, combining new capabilities with practical implications for the wider market.`,
  keyPoints: [
    `The announcement signals a significant change in the category.`,
    `Organizations are already evaluating what the development means for them.`,
    `The next phase will focus on adoption, access, and measurable impact.`,
  ],
  script: `Here is what you need to know about ${a.title.toLowerCase()}.

The story begins with a development that is quickly drawing attention across the industry. While the headline is significant, the broader context is what makes this worth watching.

For teams and consumers, the immediate question is how this changes the way products are built, decisions are made, and opportunities are created. Early signals suggest the impact will extend well beyond the initial announcement.

As the market responds, the next few months will reveal which ideas become lasting shifts. We will keep tracking the details as they develop.`,
  status: "generated",
  generatedAt: i === 0 ? "Today, 12:04 PM" : `Today, ${11 - i}:0${i} AM`,
}));

export const getSource = (id: string) => sources.find((s) => s.id === id);
export const getArticle = (id: string) => articles.find((a) => a.id === id);
export const getScript = (id: string) => scripts.find((s) => s.id === id);
export const formatSourceUrl = (url: string) => {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
};
export const stats = {
  sources: 8,
  activeSources: 6,
  articles: 124,
  scripts: 87,
};
export const activities = [
  {
    time: "12:04 PM",
    label: "Script generated",
    detail: "OpenAI announces new AI model",
  },
  { time: "12:02 PM", label: "New article detected", detail: "Reuters" },
  {
    time: "12:00 PM",
    label: "Source scan completed",
    detail: "8 sources checked",
  },
];

type TupleSource = [string, string, boolean, string, number];
void (0 as unknown as TupleSource);
