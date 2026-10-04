/** Utilities support existing templates; component appearance lives in internal.css. */
module.exports = {
  content: ['./views/**/*.xian', './public/js/**/*.js'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        gray: { 50: '#f5f6f3', 100: '#eff1ee', 200: '#dce0df', 300: '#c4cbc9',
          400: '#84918e', 500: '#687471', 600: '#596367', 700: '#414c4c',
          800: '#303a39', 850: '#242d2c', 900: '#1b2322', 950: '#111716' }
      }
    }
  },
  // These variants are selected by existing request, call and validation scripts.
  safelist: ['bg-gray-100', 'bg-blue-600', 'text-white', 'text-gray-600',
    'bg-green-500', 'bg-red-500', 'bg-yellow-500', 'border-red-500', 'border-green-500',
    'bg-red-600', 'hover:bg-red-700', 'bg-green-600', 'hover:bg-green-700',
    'bg-blue-100', 'text-blue-700', 'bg-green-100', 'text-green-700',
    'bg-yellow-100', 'text-yellow-700', 'bg-gray-100', 'text-gray-700',
    'bg-red-100', 'text-red-700', 'bg-orange-100', 'text-orange-700'],
  plugins: []
};
