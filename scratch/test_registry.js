const path = require('path');
const fs = require('fs');

const registryModule = require(path.resolve(__dirname, '../apps/momai/scripts/skills/registry.js'));

// Mocking paths
const dataDir = path.resolve(__dirname, '../.dev-data');
const builtinSkillsDir = path.resolve(__dirname, '../apps/momai/scripts/skills/core');

const registry = registryModule.createSkillRegistry({ 
  dataDir, 
  builtinSkillsDir 
});

async function runTest() {
  console.log('--- Testing Registry Loading ---');
  console.log('Data Dir:', dataDir);
  console.log('Builtin Skills Dir:', builtinSkillsDir);
  
  try {
    console.log('Calling refresh()...');
    await registry.refresh();
    
    const payload = registry.toListPayload();
    console.log(`Total skills loaded: ${payload.length}`);
    
    const devSkill = payload.find(s => s.id === 'dev');
    if (devSkill) {
      console.log('--- Dev Skill Found ---');
      console.log('Name:', devSkill.name);
      console.log('Instructions Length:', devSkill.instructions?.length || 0);
      console.log('Readme Length:', devSkill.readme?.length || 0);
      
      if (!devSkill.instructions && !devSkill.readme) {
        console.error('FAIL: Both instructions and readme are empty!');
      } else {
        console.log('SUCCESS: Content found.');
        const content = devSkill.readme || devSkill.instructions;
        console.log('Content Sample:', content.substring(0, 150).replace(/\n/g, ' ') + '...');
      }
    } else {
      console.error('FAIL: Dev skill not found in payload.');
      console.log('Available IDs:', payload.map(s => s.id));
    }
  } catch (err) {
    console.error('Error during test:', err);
  }
}

runTest();
