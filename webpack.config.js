module.exports = {
  entry: './lib/index.ts',
  mode: 'development',
  output: {
    path: `${__dirname}/dist`,
    filename: 'romi-js-soss.js',
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
