import test from 'ava';
import axios from 'axios';
import execa from 'execa';
import semver from 'semver';

import modules from './modules';
import fn from '.';

const moduleNames = Object.keys(modules);

test('basic', async t => {
	t.deepEqual(await fn('react', '15.0.0', {env: 'development'}), {
		name: 'react',
		var: 'React',
		url: 'https://cdnjs.cloudflare.com/ajax/libs/react/15.0.0/react.js',
		version: '15.0.0'
	});
});

test('unknown module', async t => {
	t.is(await fn('qwerty', '1.0.0'), null);
});

test('default to development', async t => {
	t.deepEqual(await fn('react', '15.0.0', {env: 'development'}), await fn('react', '15.0.0'));
	t.notDeepEqual(await fn('react', '15.0.0', {env: 'production'}), await fn('react', '15.0.0'));
});

test('skipped version', async t => {
	t.is(await fn('react', '16.0.0-beta.2'), null);
});

for (const moduleName of moduleNames.filter(x => x === 'react')) {
	const versionRanges = Object.keys(modules[moduleName].versions);

	test.serial(`prod: ${moduleName}@next`, testNextModule, moduleName, 'production');
	test.serial(`dev: ${moduleName}@next`, testNextModule, moduleName, 'development');

	test.serial(`prod: ${moduleName}@latest`, testLatestModule, moduleName, 'production');
	test.serial(`dev: ${moduleName}@latest`, testLatestModule, moduleName, 'development');

	getAllVersions(moduleName)
	.filter(version => {
		return versionRanges.some(range => semver.satisfies(version, range));
	})
	.forEach(version => {
		test.serial(`prod: ${moduleName}@${version}`, testModule, moduleName, version, 'production');
		test.serial(`dev: ${moduleName}@${version}`, testModule, moduleName, version, 'development');
	});
}

async function testModule(t, moduleName, version, env) {
	const cdnConfig = await fn(moduleName, version, {env});

	if (!(await isVersionAvailable(moduleName, version))) {
		return;
	}

	await testCdnConfig(t, cdnConfig, moduleName, version);
}

async function testNextModule(t, moduleName, env) {
	const tags = getModuleInfo(moduleName)['dist-tags'];

	if (!tags.next) {
		return;
	}

	const nextVersion = tags.next;
	const futureVersion = removePrereleaseItentifiers(nextVersion);

	const cdnConfig = await fn(moduleName, futureVersion, {env});

	if (cdnConfig == null) {
		return;
	}

	cdnConfig.url = cdnConfig.url.replace(futureVersion, nextVersion);

	await testCdnConfig(t, cdnConfig, moduleName, nextVersion);
}

async function testLatestModule(t, moduleName, env) {
	const tags = getModuleInfo(moduleName)['dist-tags'];

	const latestVersion = tags.latest;

	const cdnConfig = await fn(moduleName, latestVersion, {env});

	if (cdnConfig == null) {
		return;
	}

	await testCdnConfig(t, cdnConfig, moduleName, latestVersion);
}

async function testCdnConfig(t, cdnConfig, moduleName, version) {
	t.notDeepEqual(cdnConfig, null);

	t.is(cdnConfig.name, moduleName);
	t.truthy(cdnConfig.url);
	t.true(cdnConfig.url.includes(version));

	let content = await t.notThrows(axios.get(cdnConfig.url).then(x => x.data), cdnConfig.url);

	if (cdnConfig.var != null) {
		content = content.replace(/ /g, '');

		t.true(
			content.includes(`.${cdnConfig.var}=`) ||
			content.includes(`["${cdnConfig.var}"]=`) ||
			content.includes(`['${cdnConfig.var}']=`)
		);

		t.true(isValidVarName(cdnConfig.var));
	}
}

function getModuleInfo(moduleName) {
	return JSON.parse(execa.sync('npm', ['info', '--json', `${moduleName}`]).stdout);
}

function getAllVersions(moduleName) {
	return getModuleInfo(moduleName).versions;
}

async function isVersionAvailable(moduleName, version) {
	const versions = await getAvailableVersions(moduleName);

	return versions.includes(version);
}

async function getAvailableVersions(moduleName) {
	const results = await axios.get(`https://api.cdnjs.com/libraries/${moduleName}`).then(x => x.data);

	return results.assets.map(x => x.version);
}

// https://stackoverflow.com/a/31625466/3052444
function isValidVarName(name) {
	try {
		// eslint-disable-next-line no-eval
		return name.indexOf('}') === -1 && eval('(function() { a = {' + name + ':1}; a.' + name + '; var ' + name + '; }); true');
	} catch (err) {
		return false;
	}
}

function removePrereleaseItentifiers(version) {
	return `${semver.major(version)}.${semver.minor(version)}.${semver.patch(version)}`;
}
