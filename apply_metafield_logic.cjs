const fs = require('fs');
const path = require('path');

const blocksDir = path.join(__dirname, 'extensions', 'block-marketplace', 'blocks');
const files = fs.readdirSync(blocksDir).filter(file => file.endsWith('.liquid'));

files.forEach(file => {
    const filePath = path.join(blocksDir, file);
    let content = fs.readFileSync(filePath, 'utf-8');
    const blockHandle = file.replace('.liquid', '');

    if (content.includes('shop.metafields.marketplace.active_blocks')) {
        console.log(`Skipping ${file}, already contains metafield logic.`);
        return;
    }

    // Prepend the check
    const prependStr = `{% assign active_blocks = shop.metafields.marketplace.active_blocks.value %}\n{% if active_blocks contains '${blockHandle}' %}\n`;

    // Close the if statement BEFORE the schema tag. The schema tag must be at the root level in Shopify blocks
    const newContent = prependStr + content.replace('{% schema %}', '{% else %}\n<style>div[data-shopify-editor-block] { display: none; margin: 0; padding: 0; }</style>\n{% endif %}\n{% schema %}');

    fs.writeFileSync(filePath, newContent, 'utf-8');
    console.log(`Updated ${file} with activation logic.`);
});
