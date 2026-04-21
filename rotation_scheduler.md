# rotation_scheduler.py

`rotation_scheduler.py` は、各日の出席状況から担当案を自動で決める Python スクリプトです。

## できること

- 固定の担当可能範囲を守って担当を決める
- `△ / maybe` の人は、人数が足りないときだけ追加する
- 総会の日は岡本さん・岡崎さんを優先する
- 今村さんは余裕があれば外す
- 王さんが来る週は、人数に余裕があれば入門を2クラスに分ける

## 入力形式

JSON ファイルを1つ渡します。

```json
{
  "date": "2026-05-09",
  "week_index": 2,
  "meeting": true,
  "attendance": {
    "okamoto": "meeting_only",
    "Okazaki": "yes",
    "emi": "yes",
    "imamura": "maybe",
    "seityan": "meeting_only",
    "yuko": "no",
    "pei": "yes",
    "門馬": "no"
  }
}
```

### 字段说明

- `date`: 日期显示用
- `week_index`: 这个月的第几周，用来判断王さん是否参加
- `meeting`: 是否总会日，`true` 或 `false`
- `attendance`: 每个人当天的状态

### attendance 可用值

- `yes`: 可以来并可担当
- `no`: 不来
- `maybe`: 不确定，只有人数不够时才加入
- `meeting_only`: 只参加总会，不排课

## 运行方法

```bash
python rotation_scheduler.py rotation_scheduler.sample.json
```

输出默认是 Markdown。

如果想看原始 JSON:

```bash
python rotation_scheduler.py rotation_scheduler.sample.json --json
```

## 备注

- 如果需要强制把王さん参加周分成两个入門班，可以在 JSON 顶层加入 `"force_split_intro": true`
- 如果需要强制不分班，可以加入 `"force_split_intro": false`
- 如果不写，脚本会自动判断人数是否足够
