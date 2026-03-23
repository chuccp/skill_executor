/**
 * Bing搜索集成测试
 */

import { webSearch } from './src/services/tools/web';

async function testBingSearch() {
  console.log('测试 Bing 搜索集成...\n');

  try {
    // 测试默认Bing搜索
    console.log('1. 测试默认 Bing 搜索:');
    const results1 = await webSearch('TypeScript tutorial', { maxResults: 3 });
    console.log(`找到 ${results1.length} 个结果:`);
    results1.forEach((r, i) => {
      console.log(`${i + 1}. ${r.title}`);
      console.log(`   ${r.link}`);
      console.log(`   来源: ${r.source}\n`);
    });

    // 测试DuckDuckGo搜索
    console.log('2. 测试 DuckDuckGo 搜索:');
    const results2 = await webSearch('JavaScript basics', { maxResults: 3, engine: 'duckduckgo' });
    console.log(`找到 ${results2.length} 个结果:`);
    results2.forEach((r, i) => {
      console.log(`${i + 1}. ${r.title}`);
      console.log(`   ${r.link}`);
      console.log(`   来源: ${r.source}\n`);
    });

    console.log('✅ Bing搜索集成测试完成！');
  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

// 运行测试
testBingSearch();