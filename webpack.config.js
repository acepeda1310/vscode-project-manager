/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Alessandro Fragnani. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the GPLv3 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';

const fs = require('fs');
const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

/**
 * Copies the codicon SVGs (from @vscode/codicons) to dist/codicons, so codicons
 * can be rendered with custom colors in the Side Bar (see src/utils/icons.ts)
 */
class CopyCodiconsPlugin {
    apply(compiler) {
        compiler.hooks.afterEmit.tap('CopyCodiconsPlugin', () => {
            const source = path.dirname(require.resolve('@vscode/codicons/src/icons/rocket.svg'));
            const target = path.resolve(__dirname, 'dist', 'codicons');
            if (fs.existsSync(target)) {
                return;
            }
            fs.mkdirSync(target, { recursive: true });
            for (const file of fs.readdirSync(source)) {
                if (file.endsWith('.svg')) {
                    fs.copyFileSync(path.join(source, file), path.join(target, file));
                }
            }
        });
    }
}

/**@type {import('webpack').Configuration}*/
const config = {
    target: 'node', // vscode extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/

    entry: './src/extension.ts', // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
    output: { // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
        path: path.resolve(__dirname, 'dist'),
        filename: 'extension.js',
        libraryTarget: "commonjs2",
        devtoolModuleFilenameTemplate: "../[resource-path]",
    },
    optimization: {
        minimizer: [new TerserPlugin({
            parallel: true,
            extractComments: false,
            terserOptions: {
                ecma: 2020,
                keep_classnames: false,
                mangle: true,
                module: true,
                format: {
                    comments: false
                }
            }
        })],
    },
    
    plugins: [new CopyCodiconsPlugin()],
    devtool: 'source-map',
    externals: {
        vscode: "commonjs vscode" // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
    },
    resolve: { // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
        extensions: ['.ts', '.js']
    },
    module: {
        rules: [{
            test: /\.ts$/,
            exclude: /node_modules/,
            use: [{
                loader: 'ts-loader',
            }]
        }]
    },
}

module.exports = config;
