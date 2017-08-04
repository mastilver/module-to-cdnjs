'use strict';

const semver = require('semver');
const axios = require('axios');

const modules = require('./modules');

module.exports = function (moduleName, version, options) {
	return new Promise(resolve => {
		options = options || {};
		const env = options.env || 'development';

		if (typeof moduleName !== 'string') {
			throw new TypeError('Expected \'moduleName\' to be a string');
		}

		if (typeof version !== 'string') {
			throw new TypeError('Expected \'version\' to be a string');
		}

		const isModuleAvailable = moduleName in modules;
		if (!isModuleAvailable) {
			return resolve(null);
		}

		isAvailableOnCdn(moduleName, version)
		.then(isVersionAvailable => {
			if (!isVersionAvailable) {
				return resolve(null);
			}

			const range = Object.keys(modules[moduleName].versions).find(range => semver.satisfies(version, range));
			const config = modules[moduleName].versions[range];

			if (config == null) {
				return resolve(null);
			}

			let url = env === 'development' ? config.development : config.production;
			url = url.replace('[version]', version);

			resolve({
				name: moduleName,
				var: modules[moduleName].var,
				url,
				version
			});
		});
	});
};

function isAvailableOnCdn(moduleName, version) {
	return axios.get(`https://api.cdnjs.com/libraries/${moduleName}`)
	.then(x => x.data)
	.then(results => results.assets.map(x => x.version))
	.then(versions => versions.indexOf(version) >= 0);
}
