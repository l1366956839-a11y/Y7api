// 单一版本来源 —— 壳的运行时版本。
// 不要在其他任何地方硬编码版本号；一律 require('./build-info') 获取。
// 升级时只需改这里。build/release 脚本也会从这里读取。
const EMBED_VERSION = '1.3.1';

// 品牌/窗口信息（避免在多个文件里分散定义）
const PRODUCT_NAME = 'Y7api';
const WINDOW_TITLE = 'Y7api';

module.exports = { EMBED_VERSION, PRODUCT_NAME, WINDOW_TITLE };