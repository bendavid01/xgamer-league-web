/** @type {import('next').NextConfig} */
const nextConfig = {
  // 1. Hide Source Code in Production (The Anti-Curiosity Shield)
  productionBrowserSourceMaps: false,

  // 2. Strict Security Headers
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" }, // Prevents iframe embedding
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "origin-when-cross-origin" },
        ],
      },
    ];
  },

  // Matches, Standings, Players and Competitions merged into the Tournaments hub.
  // The query string (?t=<tournament>) is carried over automatically.
  async redirects() {
    return [
      ["/matches", "fixtures"],
      ["/table", "standings"],
      ["/players", "players"],
      ["/finals", "standings"],
      ["/cup", "fixtures"],
    ]
      .map(([source, tab]) => ({
        source,
        destination: `/tournaments?tab=${tab}`,
        permanent: true,
      }))
      .concat({
        source: "/competitions",
        destination: "/tournaments",
        permanent: true,
      });
  },

  // Keep your Sanity image configuration
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.sanity.io",
      },
    ],
  },
};

export default nextConfig;
