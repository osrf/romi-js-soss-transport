module.exports = {
  entry: './lib/index.ts',
  mode: 'development',
  output: {
    path: `${__dirname}/bundle`,
    filename: 'romi-js-soss-transport.js',
    library: 'romi',
    libraryTarget: 'umd',
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js"]
  },
  module: {
    rules: [
      { test: /\.tsx?$/, loader: 'ts-loader' },
    ],
  },
};
