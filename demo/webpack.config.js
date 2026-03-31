const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: './src/main.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.[contenthash].js',
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      // Use templateContent (plain string) instead of a template file to
      // avoid the lodash assignWith version conflict triggered by html-webpack-plugin's loader.
      templateContent: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Prebid Adapter Validator — Demo</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
  <header>
    <div class="logo">
      <div class="logo-mark"></div>
      <span class="logo-name">Prebid Adapter Validator</span>
      <span class="logo-sep">&mdash;</span>
      <span class="logo-tag">Demo</span>
    </div>
    <div class="header-right">
      <span class="pkg-badge">@prebid/adapter-validator</span>
      <div class="runtime-toggle" id="runtimeToggle">
        <button class="rt-btn active" data-runtime="pbjs">pbjs</button>
        <button class="rt-btn" data-runtime="pbs">pbs</button>
      </div>
    </div>
  </header>
  <div class="layout">
    <aside class="panel">
      <div class="panel-head">
        <span class="panel-title">Bidders</span>
        <span class="panel-count" id="bidderCount">&mdash;</span>
      </div>
      <div class="search-bar">
        <input class="search-input" id="searchInput" type="text" placeholder="Search&hellip;" autocomplete="off" spellcheck="false">
      </div>
      <div class="bidder-list" id="bidderList">
        <div class="list-msg">Loading&hellip;</div>
      </div>
    </aside>
    <section class="panel">
      <div class="panel-head">
        <span class="panel-title">Schema &mdash; <span id="schemaLabel" class="accent">&mdash;</span></span>
        <button class="action-btn" id="copyBtn">copy</button>
      </div>
      <div class="schema-body">
        <pre class="schema-pre" id="schemaPre"><span class="muted">Select a bidder.</span></pre>
      </div>
    </section>
    <section class="panel">
      <div class="panel-head">
        <span class="panel-title">Params</span>
        <span class="json-status" id="jsonStatus"></span>
      </div>
      <div class="params-body">
        <textarea id="paramsEditor" class="params-editor" spellcheck="false" placeholder='{ "key": "value" }'></textarea>
      </div>
      <div class="action-bar">
        <button class="btn-primary" id="validateBtn">Validate</button>
        <button class="btn-ghost" id="clearBtn">Clear</button>
      </div>
      <div class="result-area" id="resultArea">
        <p class="result-idle">Enter params and press Validate.</p>
      </div>
    </section>
  </div>
</body>
</html>`,
    }),
  ],
  devServer: {
    port: 3000,
    hot: true,
  },
};
