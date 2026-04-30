try {
  console.log('Testing schema.js...');
  require('./node-core/permissions/schema');
  console.log('Testing extension-host-manager.js...');
  require('./node-core/services/extension-host-manager');
  console.log('Testing registry.js...');
  require('./skills/registry');
  console.log('All required successfully!');
} catch (err) {
  console.error('FAILED:');
  console.error(err);
  process.exit(1);
}
