var webpack = require('webpack');
var path = require('path');
var fs = require('fs');
const CopyPlugin = require('copy-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

var nodeModules = {};
fs.readdirSync('node_modules')
    .filter(function (x) {
        return ['.bin'].indexOf(x) === -1;
    })
    .forEach(function (mod) {
        nodeModules[mod] = 'commonjs ' + mod;
    });

module.exports = {
    entry: './src/server.js',
    target: 'node',
    mode: "production",
    output: {
        path: path.join(__dirname, 'lib'),
        filename: 'backend.js'
    },
    externals: nodeModules,
    plugins: [
        new CleanWebpackPlugin(),
        new CopyPlugin({
            patterns: [
                { from: 'images', to: 'images' },
            ],
        }),
    ],
    devtool: 'sourcemap'
}