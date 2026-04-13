import { IPv4, IPv6, loadContentFromFile, newWithBuffer } from './binding/javascript/index.js';

const v4DbPath = './data/ip2region_v4.xdb';
const v6DbPath = './data/ip2region_v6.xdb';

console.log('正在加载 xdb 数据到内存...');

const v4Buffer = loadContentFromFile(v4DbPath);
const v4Searcher = newWithBuffer(IPv4, v4Buffer);
console.log(`IPv4 xdb 加载完成，大小: ${(v4Buffer.length / 1024 / 1024).toFixed(2)} MB`);

const v6Buffer = loadContentFromFile(v6DbPath);
const v6Searcher = newWithBuffer(IPv6, v6Buffer);
console.log(`IPv6 xdb 加载完成，大小: ${(v6Buffer.length / 1024 / 1024).toFixed(2)} MB`);

console.log('\n========== IPv4 查询测试 ==========');

const v4TestIps = [
  '8.8.8.8',
  '1.1.1.1',
  '114.114.114.114',
  '223.5.5.5',
  '113.118.113.77',
  '220.181.38.148',
  '39.156.66.10',
  '1.2.3.4',
  '192.168.1.1',
  '10.0.0.1',
];

for (const ip of v4TestIps) {
  const start = performance.now();
  const region = await v4Searcher.search(ip);
  const took = ((performance.now() - start) * 1000).toFixed(0);
  console.log(`  ${ip.padEnd(20)} => ${region || '(空)'}  [${took} μs]`);
}

console.log('\n========== IPv6 查询测试 ==========');

const v6TestIps = [
  '240e:3b7:3272:d8d0:db09:c067:8d59:539e',
  '2604:a840:3::a04d',
  '2001:4860:4860::8888',
  '2001:4860:4860::8844',
  '2400:3200::1',
  '2400:3200:bbb::1',
  '::1',
  '::',
];

for (const ip of v6TestIps) {
  const start = performance.now();
  const region = await v6Searcher.search(ip);
  const took = ((performance.now() - start) * 1000).toFixed(0);
  console.log(`  ${ip.padEnd(45)} => ${region || '(空)'}  [${took} μs]`);
}

console.log('\n========== 性能基准测试 (1000次 IPv4 查询) ==========');
const benchIp = '113.118.113.77';
const benchStart = performance.now();
for (let i = 0; i < 1000; i++) {
  await v4Searcher.search(benchIp);
}
const benchTook = performance.now() - benchStart;
console.log(`  1000 次查询总耗时: ${benchTook.toFixed(2)} ms`);
console.log(`  平均单次查询: ${(benchTook / 1000 * 1000).toFixed(1)} μs`);

v4Searcher.close();
v6Searcher.close();
console.log('\n测试完成！');
