const fontFile = `${__dirname}/../../node_modules/next/dist/next-devtools/server/font/geist-latin.woff2`;
const source = `url(${fontFile}) format('woff2')`;

module.exports = {
  "https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400..700&display=swap": `
    @font-face {
      font-family: 'Instrument Sans';
      font-style: normal;
      font-weight: 400 700;
      font-display: swap;
      src: ${source};
    }
  `,
  "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@100..800&display=swap": `
    @font-face {
      font-family: 'JetBrains Mono';
      font-style: normal;
      font-weight: 100 800;
      font-display: swap;
      src: ${source};
    }
  `,
};
