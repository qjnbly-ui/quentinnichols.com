export const navigation = [
  ["/vision/", "N3XRA"],
  ["/projects/", "Work"],
  ["/blog/", "Writing"],
  ["/videos/", "Videos"],
  ["/photography/", "Photography"],
  ["/about-me/", "About"],
] as const;

/** Personal social accounts, as published on Quentin's N3XRA Contact Card (24×24 icon paths). */
export const socials = [
  {
    label: "YouTube",
    href: "https://www.youtube.com/@quentin.j.nichols",
    icon: "M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.2 3.6-6.2 3.6Z",
  },
  {
    label: "TikTok",
    href: "https://www.tiktok.com/@quentin.j.nichols",
    icon: "M16.6 0h-4v16.3a3.6 3.6 0 1 1-3.6-3.6c.3 0 .7 0 1 .1V8.7a7.7 7.7 0 1 0 6.6 7.6V8a9.6 9.6 0 0 0 5.6 1.8v-4A5.6 5.6 0 0 1 16.6 0Z",
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/qnichols11/",
    icon: "M12 2.2c3.2 0 3.6 0 4.8.1 3.3.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 3.2-1.7 4.8-4.9 4.9-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-3.3-.1-4.8-1.7-4.9-4.9C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.8C2.4 3.9 3.9 2.4 7.2 2.3 8.4 2.2 8.8 2.2 12 2.2ZM12 0C8.7 0 8.3 0 7.1.1 2.7.3.3 2.7.1 7.1 0 8.3 0 8.7 0 12s0 3.7.1 4.9c.2 4.4 2.6 6.8 7 7 1.2.1 1.6.1 4.9.1s3.7 0 4.9-.1c4.4-.2 6.8-2.6 7-7 .1-1.2.1-1.6.1-4.9s0-3.7-.1-4.9c-.2-4.4-2.6-6.8-7-7C15.7 0 15.3 0 12 0Zm0 5.8a6.2 6.2 0 1 0 0 12.4 6.2 6.2 0 0 0 0-12.4ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.4-11.8a1.4 1.4 0 1 0 0 2.9 1.4 1.4 0 0 0 0-2.9Z",
  },
  {
    label: "Facebook",
    href: "https://www.facebook.com/quentin.nichols.96",
    icon: "M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12Z",
  },
  {
    label: "X",
    href: "https://x.com/qnichols11",
    icon: "M18.9 1.2h3.7l-8 9.2L24 22.8h-7.4l-5.8-7.6-6.6 7.6H.5l8.6-9.8L0 1.2h7.6l5.2 6.9 6.1-6.9Zm-1.3 19.4h2L6.5 3.3H4.3l13.3 17.3Z",
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/in/quentin-nichols-679927218",
    icon: "M20.4 20.5h-3.6v-5.6c0-1.3 0-3-1.8-3s-2.1 1.4-2.1 2.9v5.7H9.4V9h3.4v1.6c.5-.9 1.6-1.8 3.4-1.8 3.6 0 4.3 2.4 4.3 5.5v6.2ZM5.3 7.4a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2ZM7.1 20.5H3.6V9h3.5v11.5ZM22.2 0H1.8C.8 0 0 .8 0 1.7v20.6c0 .9.8 1.7 1.8 1.7h20.4c1 0 1.8-.8 1.8-1.7V1.7C24 .8 23.2 0 22.2 0Z",
  },
];

/** Why N3XRA exists. The homepage shows each chapter's summary; /vision/ shows it all. */
export const visionChapters = [
  {
    label: "Where it started",
    title: "I wanted to build things.",
    summary:
      "In 2019, while living in New Zealand, I ordered my first coding books. I had ideas for software, but no computer science degree and no clear path from the idea to the finished thing.",
    body: [
      "In 2019, while living in New Zealand, I ordered my first coding books. I had ideas for software, but no computer science degree and no clear path from the idea to the finished thing.",
      "I started connecting AppSheet, Google Sheets, APIs, and automations. That taught me to look at how information moves, where people repeat themselves, and how one useful connection can change the way something works.",
      "AI opened up more of what I could build. It also made the decisions behind the code more important: what the system is for, who should have access, and whether it actually helps the person using it.",
    ],
    link: ["Read the longer story", "/blog/post/from-coding-books-to-vibe-coding/"],
  },
  {
    label: "What I’m working toward",
    title: "Tools that work together.",
    summary:
      "A website is the public face of a business. Behind it are the files, customers, messages, and schedules that keep it moving. I want N3XRA to connect those pieces.",
    body: [
      "A website can be the public face of a business. Behind it are the files, customer information, messages, schedules, and processes that keep the business moving.",
      "I want N3XRA to connect those pieces. Start with the thing someone needs today, then build on that foundation as their work grows.",
      "That means building reusable products alongside custom work. When a connection gets better for one project, it should be able to make other projects better too.",
    ],
  },
  {
    label: "How I want to build it",
    title: "Stay close to the real work.",
    summary:
      "The projects I care about have people behind them: a business owner, a small team, a town, or someone with an idea they haven’t been able to bring to life.",
    body: [
      "The projects I care about have people behind them: a business owner, a small team, a town, or someone with an idea they haven’t been able to bring to life.",
      "I want the company to keep that connection as it grows. The technology matters because of what someone can do with it.",
      "This website is part of that work. It’s my own place to use what I build, explain the decisions, and keep sharing what I learn.",
    ],
  },
];

/** N3XRA products this site runs on, with their honest status. */
export const tools = [
  {
    name: "Contact Card",
    role: "How to reach me",
    text: "My contact details live in Contact Card. The contact page reads them from there, so they stay current everywhere.",
    status: "Live on this site",
    live: true,
    href: "/contact/",
  },
  {
    name: "Studio",
    role: "My photography",
    text: "My photographs are stored in N3XRA and shown here in a gallery designed for this site.",
    status: "Gallery album being set up",
    live: false,
    href: "/photography/",
  },
  {
    name: "Communications",
    role: "Updates you choose",
    text: "Topic-based updates about N3XRA, writing, and photography, with consent handled properly.",
    status: "Signup being set up",
    live: false,
    href: "/updates/",
  },
];

export const videos = [
  {
    id: "1Isr5qFXgkw",
    title: "Retiring My Sister’s Tricycle With a Good View",
    description: "A personal story, a mountain, and a view worth sharing.",
    tag: "From my YouTube channel",
  },
  {
    id: "_BGr-C-zti4",
    title: "Snowshoeing Up Gearhart Mountain",
    description: "A trip to the summit to spread my grandma’s ashes.",
    tag: "Gearhart Mountain, Oregon",
  },
  {
    id: "6TQK4Heag5Q",
    title: "Tour of Kennedy Space Center",
    description: "A look around a place built for some very ambitious ideas.",
    tag: "Kennedy Space Center",
  },
  {
    id: "yJg25KUyHZY",
    title: "I Want To Meet That Beaver",
    description: "Sometimes the title says everything it needs to.",
    tag: "Out exploring",
  },
  {
    id: "KN4f5cY1lEQ",
    title: "The Palisades | Gearhart Mountain, Oregon",
    description: "A video from Gearhart Mountain, Oregon.",
    tag: "Gearhart Mountain, Oregon",
  },
];
export const work = [
  {
    slug: "n3xra",
    name: "N3XRA",
    category: "The company I’m building",
    summary:
      "Websites, software, and the connections behind them. My focus is bringing the tools people need into systems that work together.",
    image: "/images/n3xra-site.webp",
    href: "https://www.n3xra.com/",
    detail:
      "N3XRA is where my interest in software becomes practical work. I build websites and connected tools for businesses, towns, and community organizations, while developing products that can serve more than one project.",
    reason:
      "I kept seeing information scattered between websites, spreadsheets, messages, and applications. I want the work behind those tools to connect, so people spend less time maintaining the connections themselves.",
    links: [
      ["Explore N3XRA", "https://www.n3xra.com/"],
      ["My vision for the company", "/vision/"],
    ],
  },
  {
    slug: "bearing",
    name: "Bearing",
    category: "An app for Apple Watch",
    summary:
      "Location, compass, and timing on your wrist. A focused app that brings useful information together while you’re out.",
    image: "/images/bearing-icon.png",
    href: "https://www.n3xra.com/bearing/",
    detail:
      "Bearing brings location, compass, and timing tools to Apple Watch. It is a different kind of N3XRA project: a small, focused product for a device you already have with you.",
    reason:
      "Useful software does not always need to be a large platform. Sometimes it means bringing a few things together in a place where they are easy to reach.",
    links: [["Explore Bearing", "https://www.n3xra.com/bearing/"]],
  },
  {
    slug: "ruth-obenchain-recreation-center",
    name: "Ruth Obenchain Recreation Center",
    category: "A community system in Bly",
    summary:
      "A website and membership systems built around the everyday needs of a community recreation center.",
    image: "/images/rorc-site.webp",
    href: "https://www.ruthobenchainrc.com/",
    detail:
      "The recreation center has been part of my life since its restoration began. Building its website and membership systems grew out of being involved in the work itself.",
    reason:
      "Memberships, access, and day-to-day administration are real needs for a small community space. This is the kind of work that shapes how I think about N3XRA: start with the people doing the work and build around them.",
    links: [
      ["Visit the recreation center", "https://www.ruthobenchainrc.com/"],
      ["More about my involvement", "/about-me/#recreation-center"],
    ],
  },
  {
    slug: "bly-outdoor-store",
    name: "The Bly Outdoor Store",
    category: "A local business website",
    summary:
      "An online home for a Bly business, bringing its store, classes, and community information together.",
    image: "/images/bly-store.webp",
    href: "https://theblyoutdoorstore.com/",
    detail:
      "The Bly Outdoor Store needed an online home for its products, firearm safety instruction, classes, and community events.",
    reason:
      "A local website should make it easier for people to understand the business and find what they need. This project brings different parts of the store into a clear public presence.",
    links: [["Visit The Bly Outdoor Store", "https://theblyoutdoorstore.com/"]],
  },
];
