import type { BlogPost } from "../content/blog";

const modules = import.meta.glob("../content/blog/*.@(pt-BR|en|es).md", {
  query: "?raw",
  import: "default",
  eager: true,
});

const MONTHS_PT: Record<string, number> = {
  janeiro: 0,
  jan: 0,
  fevereiro: 1,
  fev: 1,
  marco: 2,
  mar: 2,
  março: 2,
  abril: 3,
  abr: 3,
  maio: 4,
  junho: 5,
  jun: 5,
  julho: 6,
  jul: 6,
  agosto: 7,
  ago: 7,
  setembro: 8,
  set: 8,
  sept: 8,
  outubro: 9,
  out: 9,
  novembro: 10,
  nov: 10,
  dezembro: 11,
  dez: 11,
};

const LOCALE_MONTHS: Record<string, Record<string, number>> = {
  "pt-BR": MONTHS_PT,
  en: {
    january: 0,
    jan: 0,
    february: 1,
    feb: 1,
    march: 2,
    mar: 2,
    april: 3,
    apr: 3,
    may: 4,
    june: 5,
    jun: 5,
    july: 6,
    jul: 6,
    august: 7,
    aug: 7,
    september: 8,
    sep: 8,
    sept: 8,
    october: 9,
    oct: 9,
    november: 10,
    nov: 10,
    december: 11,
    dec: 11,
  },
  es: {
    enero: 0,
    ene: 0,
    febrero: 1,
    feb: 1,
    marzo: 2,
    mar: 2,
    abril: 3,
    abr: 3,
    mayo: 4,
    junio: 5,
    jun: 5,
    julio: 6,
    jul: 6,
    agosto: 7,
    ago: 7,
    septiembre: 8,
    set: 8,
    sep: 8,
    octubre: 9,
    oct: 9,
    noviembre: 10,
    nov: 10,
    diciembre: 11,
    dic: 11,
  },
};

function parseFrontmatter(content: string) {
  const fm: Record<string, string | boolean> = {};
  let markdownContent = content;

  if (content.startsWith("---")) {
    const end = content.indexOf("---", 3);
    if (end !== -1) {
      const frontmatter = content.slice(3, end).trim();
      markdownContent = content.slice(end + 3).trim();

      for (const line of frontmatter.split("\n")) {
        const idx = line.indexOf(":");
        if (idx !== -1) {
          let val: string | boolean = line.slice(idx + 1).trim();
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          ) {
            val = val.slice(1, -1);
          } else if (val === "true") {
            val = true;
          } else if (val === "false") {
            val = false;
          }
          fm[line.slice(0, idx).trim()] = val;
        }
      }
    }
  }

  return { attributes: fm, content: markdownContent };
}

function parseDate(dateStr: string, locale: string): Date {
  if (!dateStr) return new Date(0);
  const months = LOCALE_MONTHS[locale] || LOCALE_MONTHS["pt-BR"];
  const match = dateStr.match(/(\d{1,2})\s+(?:de\s+)?(\w+)\s*,?\s*(\d{4})/i);
  if (!match) {
    const fallback = new Date(dateStr);
    return isNaN(fallback.getTime()) ? new Date(0) : fallback;
  }
  const [, day, monthStr, year] = match;
  const month = months[monthStr.toLowerCase()];
  if (month === undefined) return new Date(0);
  return new Date(Number(year), month, Number(day));
}

export function loadBlogPosts(locale?: string): BlogPost[] {
  const posts: BlogPost[] = [];
  const activeLocale = locale || "pt-BR";

  for (const [path, content] of Object.entries(modules)) {
    const { attributes, content: markdownContent } = parseFrontmatter(content);
    const filename = path.split("/").pop() ?? "";
    const localeMatch = filename.match(/\.([a-z]{2}(-[A-Z]{2})?)\.md$/);
    const fileLocale = localeMatch ? localeMatch[1] : "pt-BR";
    if (fileLocale !== activeLocale) continue;

    const id = filename.replace(/\.(pt-BR|en|es)\.md$/, "");

    const author = attributes.author as string | undefined;

    posts.push({
      id,
      locale: fileLocale,
      title: (attributes.title as string) || id,
      date: (attributes.date as string) || "",
      excerpt: (attributes.excerpt as string) || "",
      image: (attributes.image as string) || "",
      content: markdownContent,
      featured: attributes.featured === true || attributes.featured === "true",
      author: author || undefined,
    });
  }

  posts.sort((a, b) => {
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;
    return (
      parseDate(b.date, activeLocale).getTime() -
      parseDate(a.date, activeLocale).getTime()
    );
  });

  return posts;
}
