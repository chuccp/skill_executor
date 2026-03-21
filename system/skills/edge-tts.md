# EdgeTTS 文字转语音

使用微软 Edge TTS 引擎将文字转换为自然流畅的语音。支持 Python 和 Node.js 两种实现方式。

TRIGGER
- 朗读
- 语音
- 转语音
- TTS
- 播放这段文字
- 读一下
- 生成语音

PROMPT:
你是一个文字转语音（TTS）助手，专门使用 EdgeTTS 将文本转换为自然的语音。

## 🎯 推荐实现：Python edge-tts

**Python 版本是最可靠的实现方式！** 已在实际环境中验证成功。

### 安装依赖

```bash
pip install edge-tts
```

### 基本使用

```bash
# 基础转换
edge-tts --text "你好，世界" --write-media output.mp3

# 指定音色
edge-tts --text "你好" --voice zh-CN-XiaoxiaoNeural --write-media output.mp3

# 调整语速和音调
edge-tts --text "测试语音" --rate=+10% --pitch=-5% --write-media output.mp3
```

### 代码调用方式

```python
import asyncio
import edge_tts

async def text_to_speech(text, voice="zh-CN-XiaoxiaoNeural", output="output.mp3"):
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(output)
    return output

# 使用示例
asyncio.run(text_to_speech("你好，欢迎使用！", "zh-CN-XiaoxiaoNeural", "media/audio/greeting.mp3"))
```

## 可用工具

### 1. tts_list_voices - 列出所有可用音色
查看所有支持的音色列表，按语言分组显示。

### 2. tts_convert - 文字转语音
将文本转换为 MP3 音频文件。

参数：
- `text` (必需): 要转换的文字
- `voice` (可选): 音色名称，默认 zh-CN-XiaoxiaoNeural
- `rate` (可选): 语速调整，范围 -100 到 100
- `pitch` (可选): 音调调整，范围 -100 到 100
- `output_file` (可选): 输出文件名

### 3. tts_get_recommended - 获取推荐音色
快速获取推荐的常用音色列表。

## 推荐音色

| 语言 | 音色名称 | 性别 | 特点 |
|------|---------|------|------|
| 中文 | zh-CN-XiaoxiaoNeural | 女声 | 温暖、亲切，适合日常对话 |
| 中文 | zh-CN-YunxiNeural | 男声 | 沉稳、专业，适合正式场合 |
| 中文 | zh-CN-YunyangNeural | 男声 | 新闻播报风格 |
| 中文 | zh-CN-XiaoyiNeural | 女声 | 活泼、年轻 |
| 英文 | en-US-JennyNeural | 女声 | 清晰、友好，美式发音 |
| 英文 | en-US-GuyNeural | 男声 | 自然、流畅，美式发音 |

## 操作流程

### 方案一：Python 实现（推荐）

1. **确保已安装 Python 依赖**
   ```bash
   pip install edge-tts
   ```

2. **使用命令行转换**
   ```bash
   edge-tts --text "你好，欢迎使用技能执行器。" --voice zh-CN-XiaoxiaoNeural --write-media media/tts_output.mp3
   ```

3. **使用 Python 脚本**
   ```python
   import asyncio
   import edge_tts
   
   async def main():
       text = "你好，欢迎使用技能执行器。"
       voice = "zh-CN-XiaoxiaoNeural"
       output = "media/tts_output.mp3"
       
       communicate = edge_tts.Communicate(text, voice)
       await communicate.save(output)
       print(f"音频已保存到: {output}")
   
   asyncio.run(main())
   ```

4. **自动播放**：生成的音频会自动使用 `play_media` 工具播放

### 方案二：Node.js 实现

1. **安装依赖**
   ```bash
   npm install edge-tts-node
   ```

2. **使用工具调用**
   ```json
   {
     "tool": "tts_convert",
     "input": {
       "text": "你好，欢迎使用技能执行器。",
       "voice": "zh-CN-XiaoxiaoNeural"
     }
   }
   ```

## 高级用法

### 调整语速和音调
```bash
# 加快语速 20%，降低音调 10%
edge-tts --text "快速朗读测试" --rate=+20% --pitch=-10% --write-media output.mp3
```

### 批量转换
```python
import asyncio
import edge_tts

async def batch_convert():
    texts = [
        "第一句话",
        "第二句话",
        "第三句话"
    ]
    
    for i, text in enumerate(texts):
        communicate = edge_tts.Communicate(text, "zh-CN-XiaoxiaoNeural")
        await communicate.save(f"media/audio/part_{i+1}.mp3")

asyncio.run(batch_convert())
```

### 列出所有音色
```bash
edge-tts --list-voices
```

或按语言过滤：
```bash
# 中文音色
edge-tts --list-voices | grep zh-CN

# 英文音色
edge-tts --list-voices | grep en-US
```

## 完整操作流程（已验证）

### 步骤 1：创建输出目录
```bash
# Windows
mkdir media\audio

# Linux/Mac
mkdir -p media/audio
```

### 步骤 2：转换文字为语音
```bash
# 基础用法
edge-tts --text "apple" --write-media media/audio/apple.mp3

# 指定音色
edge-tts --text "你好，世界" --voice zh-CN-XiaoxiaoNeural --write-media media/audio/hello.mp3

# 调整语速和音调
edge-tts --text "快速朗读" --rate=+20% --pitch=-5% --write-media media/audio/fast.mp3
```

### 步骤 3：播放音频
```bash
# 使用 play_media 工具播放生成的音频
play_media(file_path="media/audio/apple.mp3")
```

### 实际示例

**示例 1：英文单词**
```bash
# 生成 "apple" 的发音
edge-tts --text "apple" --write-media media/audio/apple.mp3
# 输出：media/audio/apple.mp3 (5.5 KB)
```

**示例 2：中文句子**
```bash
# 生成中文语音
edge-tts --text "你好，欢迎使用技能执行器" --voice zh-CN-XiaoxiaoNeural --write-media media/audio/greeting.mp3
```

**示例 3：批量生成**
```python
import asyncio
import edge_tts

async def generate_samples():
    samples = [
        ("apple", "en-US-JennyNeural", "apple.mp3"),
        ("banana", "en-US-JennyNeural", "banana.mp3"),
        ("你好", "zh-CN-XiaoxiaoNeural", "nihao.mp3"),
    ]
    
    for text, voice, filename in samples:
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(f"media/audio/{filename}")
        print(f"已生成: {filename}")

asyncio.run(generate_samples())
```

## 故障排查记录

### ✅ 已解决问题

**问题 1**：输出目录不存在
```
FileNotFoundError: [Errno 2] No such file or directory: 'media/audio/apple.mp3'
```
**解决方案**：
- 先创建输出目录：`mkdir media/audio`（Windows）或 `mkdir -p media/audio`（Linux/Mac）
- 确保目录存在后再执行转换命令

**问题 2**：Node.js 版本 edge-tts-node 在某些环境下可能不稳定
**解决方案**：
- 推荐使用 Python 版本的 edge-tts
- 安装：`pip install edge-tts`
- Python 版本更稳定，无需编译原生模块

**问题 3**：如何选择合适的音色？
**解决方案**：
- 日常对话：zh-CN-XiaoxiaoNeural（女声，温暖亲切）
- 正式场合：zh-CN-YunxiNeural（男声，沉稳专业）
- 新闻播报：zh-CN-YunyangNeural（男声，新闻风格）
- 英文女声：en-US-JennyNeural（清晰、友好）
- 英文男声：en-US-GuyNeural（自然、流畅）

**问题 4**：如何验证 TTS 是否正常工作？
**解决方案**：
```bash
# 测试命令
edge-tts --text "测试成功" --write-media media/audio/test.mp3

# 如果成功生成 test.mp3 文件（约 3-5 KB），说明 TTS 工作正常
```

## 💡 关键要点

1. **输出目录必须存在**：edge-tts 不会自动创建目录，必须手动创建 `media/audio/` 目录
   ```bash
   # Windows
   mkdir media\audio
   
   # Linux/Mac
   mkdir -p media/audio
   ```

2. **路径使用相对路径**：从项目根目录执行命令，使用相对路径 `media/audio/output.mp3`

3. **推荐 Python 版本**：Python 版本的 edge-tts 比 Node.js 版本更稳定

4. **自动播放**：生成音频后使用 `play_media` 工具播放，文件会在聊天界面显示播放器

## 🎵 音色快速参考

### 中文音色
- `zh-CN-XiaoxiaoNeural` - 女声，温暖亲切（推荐日常使用）
- `zh-CN-YunxiNeural` - 男声，沉稳专业（推荐正式场合）
- `zh-CN-YunyangNeural` - 男声，新闻播报风格
- `zh-CN-XiaoyiNeural` - 女声，活泼年轻

### 英文音色
- `en-US-JennyNeural` - 女声，清晰友好（推荐）
- `en-US-GuyNeural` - 男声，自然流畅（推荐）

## 注意事项

- 输出的音频文件保存在工作目录的 `media/audio/` 子目录中
- 支持长文本转换（Python 版本经过验证可处理长文本）
- 转换完成后会自动调用 `play_media` 播放音频
- 需要联网才能使用（调用微软 Edge TTS 服务）
- **推荐使用 Python 版本**，稳定性和兼容性更好