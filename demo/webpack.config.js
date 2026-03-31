const fs = require("fs");
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = (env, argv) => {
  // Production builds are deployed to GitHub Pages under /pb-validator/.
  // Dev server serves from root so assets resolve without a subpath.
  const publicPath = argv.mode === "production" ? "/pb-validator/" : "/";

  return {
    entry: "./src/main.js",
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "bundle.[contenthash].js",
      clean: true,
      publicPath,
    },
    module: {
      rules: [
        {
          test: /\.css$/,
          use: ["style-loader", "css-loader"],
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        // Read the template at config time so html-webpack-plugin receives a plain
        // string, bypassing its loader and avoiding the lodash assignWith conflict.
        templateContent: fs.readFileSync(
          path.resolve(__dirname, "src/index.html"),
          "utf-8"
        ),
      }),
    ],
    devServer: {
      port: 3000,
      hot: true,
    },
  };
};
