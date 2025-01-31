import fs from 'node:fs/promises'
import path from 'node:path'


/**
 * Bumps the version of the package.
 * @param {'major' | 'minor' | 'patch'} type - The type of version to bump.
 */
async function bumpVersion(type) {
  // Read package.json
  const packageJson = JSON.parse(
    await fs.readFile(path.resolve('package.json'), 'utf-8')
  )
  const packageLockJson = JSON.parse(
    await fs.readFile(path.resolve('package-lock.json'), 'utf-8')
  )

  // Parse current version
  const [major, minor, patch] = packageJson.version.split('.').map(Number)

  // Calculate new version
  /**
   * The new version of the package.
   * @type {string}
   */
  let newVersion
  switch (type) {
    case 'major':
      newVersion = `${major + 1}.0.0`
      break
    case 'minor':
      newVersion = `${major}.${minor + 1}.0`
      break
    case 'patch':
      newVersion = `${major}.${minor}.${patch + 1}`
      break
  }

  // Update both files
  packageJson.version = newVersion
  packageLockJson.version = newVersion
  packageLockJson.packages[''].version = newVersion

  // Write back
  await fs.writeFile(
    path.resolve('package.json'),
    JSON.stringify(packageJson, null, 2) + '\n'
  )
  await fs.writeFile(
    path.resolve('package-lock.json'),
    JSON.stringify(packageLockJson, null, 2) + '\n'
  )

  console.log(`Version bumped to ${newVersion}`)
}

// Get version type from command line argument
/**
 * The type of version to bump.
 * @type {'major' | 'minor' | 'patch'}
 */
const type = process.argv[2]
if (!type || !['major', 'minor', 'patch'].includes(type)) {
  console.error('Please specify version type: major, minor, or patch')
  process.exit(1)
}

bumpVersion(type).catch(console.error) 