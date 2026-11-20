export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter Variable', 'system-ui', 'sans-serif'], display: ['Baskervville', 'Georgia', 'serif'] },
      colors: { forge: { base: '#101015', panel: '#19191f', edge: '#303039', lilac: '#b99aef', gold: '#edc47c' } },
    },
  },
};
