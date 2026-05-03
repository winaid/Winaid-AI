/**
 * 셸 보간을 우회한 ffmpeg / ffprobe / 외부 도구 wrapper.
 *
 * 기존 execSync(template-string) 패턴은 사용자 제어 path/ext 가 셸 escape 우회로
 * command injection 가능. execFile(cmd, args[]) 는 인자 array 라 shell 통과 X →
 * escape 자체가 불필요해 injection 차단.
 *
 * 사용 패턴:
 *   await runFfmpeg(['-y', '-i', inputPath, '-vf', filter, outputPath]);
 *   const { stdout } = await runFfprobe(['-v', 'error', '-i', inputPath]);
 *   await runTool('auto-editor', [inputPath, '--no-open', '-o', outputPath]);
 */

const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const DEFAULT_MAX_BUFFER = 100 * 1024 * 1024; // 100 MB — ffmpeg 출력 큰 경우 대비
const DEFAULT_FFMPEG_TIMEOUT = 300_000;       // 5 min
const DEFAULT_FFPROBE_TIMEOUT = 15_000;       // 15 sec
const DEFAULT_TOOL_TIMEOUT = 180_000;         // 3 min

/**
 * ffmpeg 호출 (인자 array). 셸 보간 없음.
 * @param {string[]} args ffmpeg 인자 array (예: ['-y', '-i', input, output])
 * @param {object} [options] { timeout, cwd, maxBuffer }
 * @returns {Promise<{stdout: string|Buffer, stderr: string|Buffer}>}
 */
async function runFfmpeg(args, options = {}) {
  return execFileAsync('ffmpeg', args, {
    timeout: options.timeout ?? DEFAULT_FFMPEG_TIMEOUT,
    maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER,
    cwd: options.cwd,
  });
}

/**
 * ffprobe 호출 (인자 array).
 */
async function runFfprobe(args, options = {}) {
  return execFileAsync('ffprobe', args, {
    timeout: options.timeout ?? DEFAULT_FFPROBE_TIMEOUT,
    maxBuffer: options.maxBuffer ?? 10 * 1024 * 1024,
    cwd: options.cwd,
  });
}

/**
 * 일반 외부 도구 호출 (auto-editor 등). cmd 도 검증된 고정 문자열 사용 권장.
 */
async function runTool(cmd, args, options = {}) {
  return execFileAsync(cmd, args, {
    timeout: options.timeout ?? DEFAULT_TOOL_TIMEOUT,
    maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER,
    cwd: options.cwd,
  });
}

module.exports = { runFfmpeg, runFfprobe, runTool };
