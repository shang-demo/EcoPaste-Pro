import { emit } from "@tauri-apps/api/event";
import { LISTEN_KEY } from "@/constants";
import { destroyDatabase } from "@/database";
import { restoreStore } from "@/utils/store";
import { wait } from "@/utils/shared";

/**
 * 热重载数据（无需重启应用）
 *
 * 用于导入备份文件 / WebDAV 恢复等场景，
 * 将「关闭旧 DB → 覆盖数据文件 → 恢复 Store → 刷新列表」封装为统一流程。
 *
 * 注意：Tauri 的每个窗口有独立的 JS 上下文，DB 单例是 per-window 的。
 * 因此需要同时：
 * - emit(CLOSE_DATABASE) 广播事件让主窗口销毁其 DB 实例
 * - destroyDatabase() 直接销毁当前窗口（偏好设置窗口）的 DB 实例
 *
 * @param dataAction 数据覆盖回调，如解压备份文件到数据目录
 */
export const hotReloadData = async (dataAction: () => Promise<void>) => {
	// 1. 广播事件让主窗口销毁其 DB 实例（跨窗口）
	emit(LISTEN_KEY.CLOSE_DATABASE);

	// 2. 销毁当前窗口的 DB 实例（本地）
	await destroyDatabase();

	// 3. 等待主窗口的事件处理完成
	await wait(200);

	// 4. 执行数据覆盖操作（由调用方提供）
	await dataAction();

	// 5. 恢复 Store（从备份文件读取配置并覆盖 valtio store）
	await restoreStore(true);

	// 6. 通知主窗口刷新剪贴板列表（会触发 DB 重新初始化）
	emit(LISTEN_KEY.REFRESH_CLIPBOARD_LIST);
};
