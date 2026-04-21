import argparse
import json
from dataclasses import dataclass
from itertools import combinations, permutations
from pathlib import Path


TEACHER_ORDER = ["岡本", "柴田", "今村", "門馬", "蔦尾", "岡崎", "相良", "裴"]
ALIASES = {
    "okamoto": "岡本",
    "okazaki": "岡崎",
    "yuko": "相良",
    "imamura": "今村",
    "emi": "蔦尾",
    "seityan": "柴田",
    "pei": "裴",
}
REMOTE_PRIORITY = {"岡本", "岡崎"}
CLASS_RULES = {
    "きく": {"岡本", "岡崎", "相良"},
    "さくら": {"岡本", "柴田", "今村", "門馬", "蔦尾", "岡崎", "相良", "裴"},
    "わかば": {"岡本", "柴田", "今村", "門馬", "蔦尾", "相良"},
    "入門": {"岡本", "柴田", "今村", "門馬", "蔦尾", "相良"},
    "入門(denji)": {"岡本", "柴田", "今村", "門馬", "蔦尾", "相良"},
    "入門(王)": {"岡本", "柴田", "今村", "門馬", "蔦尾", "相良", "裴"},
}


@dataclass(frozen=True)
class TeacherState:
    name: str
    status: str


def normalize_name(name: str) -> str:
    return ALIASES.get(name.lower(), name)


def normalize_status(status: str) -> str:
    status = status.strip().lower()
    mapping = {
        "yes": "yes",
        "ok": "yes",
        "o": "yes",
        "available": "yes",
        "can": "yes",
        "no": "no",
        "x": "no",
        "unavailable": "no",
        "maybe": "maybe",
        "tentative": "maybe",
        "uncertain": "maybe",
        "delta": "maybe",
        "meeting_only": "meeting_only",
        "meeting-only": "meeting_only",
        "meeting only": "meeting_only",
    }
    if status not in mapping:
        raise ValueError(f"Unknown status: {status}")
    return mapping[status]


def wang_attends(week_index: int) -> bool:
    return week_index % 2 == 1


def classes_for_day(wang_is_here: bool, force_split_intro: bool | None = None) -> tuple[list[str], list[str]]:
    required = ["きく", "さくら", "わかば", "入門"]
    optional = []
    if wang_is_here:
        if force_split_intro is True:
            required = ["きく", "さくら", "わかば", "入門(denji)", "入門(王)"]
        elif force_split_intro is False:
            required = ["きく", "さくら", "わかば", "入門"]
        else:
            optional = ["入門(王)"]
    return required, optional


def teacher_priority(name: str, meeting: bool) -> tuple[int, int, int]:
    remote_rank = 0 if meeting and name in REMOTE_PRIORITY else 1
    imamura_rank = 1 if name == "今村" else 0
    order_rank = TEACHER_ORDER.index(name)
    return (remote_rank, imamura_rank, order_rank)


def score_assignment(chosen: list[str], assigned: dict[str, str], meeting: bool) -> tuple[int, int, int, int]:
    remote_count = sum(1 for teacher in chosen if teacher in REMOTE_PRIORITY)
    imamura_used = sum(1 for teacher in chosen if teacher == "今村")
    stable_order = sum(TEACHER_ORDER.index(name) for name in chosen)
    intro_split = 1 if any(c == "入門(王)" for c in assigned.values()) else 0
    return (remote_count, -imamura_used, intro_split, -stable_order)


def try_assign(teachers: list[str], classes: list[str], meeting: bool) -> dict[str, str] | None:
    teacher_count = len(teachers)
    class_count = len(classes)
    if teacher_count < class_count:
        return None

    sorted_teachers = sorted(teachers, key=lambda name: teacher_priority(name, meeting))
    best_assignment = None
    best_score = None

    for chosen in combinations(sorted_teachers, class_count):
        for ordered in permutations(chosen):
            assignment = dict(zip(classes, ordered))
            if all(assignment[class_name] in CLASS_RULES[class_name] for class_name in classes):
                current_score = score_assignment(list(chosen), assignment, meeting)
                if best_score is None or current_score > best_score:
                    best_score = current_score
                    best_assignment = assignment
                break

    return best_assignment


def build_teacher_pool(attendance: dict[str, str]) -> tuple[list[str], list[str], list[str]]:
    yes_teachers = []
    maybe_teachers = []
    meeting_only = []

    for raw_name, raw_status in attendance.items():
        name = normalize_name(raw_name)
        status = normalize_status(raw_status)
        if name not in TEACHER_ORDER:
            raise ValueError(f"Unknown teacher: {raw_name}")
        if status == "yes":
            yes_teachers.append(name)
        elif status == "maybe":
            maybe_teachers.append(name)
        elif status == "meeting_only":
            meeting_only.append(name)

    return yes_teachers, maybe_teachers, meeting_only


def resolve_schedule(payload: dict) -> dict:
    date = payload["date"]
    week_index = int(payload["week_index"])
    attendance = payload["attendance"]
    meeting = bool(payload.get("meeting", False))
    force_split_intro = payload.get("force_split_intro")

    if force_split_intro not in (None, True, False):
        raise ValueError("force_split_intro must be true, false, or omitted")

    yes_teachers, maybe_teachers, meeting_only = build_teacher_pool(attendance)
    wang_is_here = bool(payload.get("wang_attends", wang_attends(week_index)))

    required_classes, optional_classes = classes_for_day(wang_is_here, force_split_intro)
    assignment = try_assign(yes_teachers, required_classes, meeting)
    selected_maybe = []

    if assignment is None:
        sorted_maybe = sorted(maybe_teachers, key=lambda name: teacher_priority(name, meeting))
        for teacher in sorted_maybe:
            selected_maybe.append(teacher)
            assignment = try_assign(yes_teachers + selected_maybe, required_classes, meeting)
            if assignment is not None:
                break

    notes = []
    used_classes = list(required_classes)

    if assignment is not None and optional_classes:
        split_assignment = try_assign(yes_teachers + selected_maybe, required_classes[:-1] + optional_classes + ["入門(denji)"], meeting)
        if split_assignment is not None:
            assignment = split_assignment
            used_classes = required_classes[:-1] + ["入門(denji)"] + optional_classes
            notes.append("王さん参加週で人数に余裕があるため、入門を2クラスに分けました。")
        else:
            notes.append("王さん参加週ですが人数が足りないため、入門は1クラスです。")

    if assignment is None:
        fallback_classes = []
        pool = yes_teachers + selected_maybe
        for class_name in required_classes:
            trial = fallback_classes + [class_name]
            if try_assign(pool, trial, meeting) is not None:
                fallback_classes = trial
        assignment = try_assign(pool, fallback_classes, meeting) or {}
        used_classes = fallback_classes
        missing = [c for c in required_classes if c not in used_classes]
        if missing:
            notes.append("人数不足のため、一部クラスは未定です: " + ", ".join(missing))

    used_teachers = sorted(set(assignment.values()), key=TEACHER_ORDER.index)
    not_needed_maybe = [name for name in maybe_teachers if name not in selected_maybe]

    return {
        "date": date,
        "week_index": week_index,
        "meeting": meeting,
        "wang_attends": wang_is_here,
        "classes": used_classes,
        "assignments": assignment,
        "selected_teachers": used_teachers,
        "selected_maybe_teachers": selected_maybe,
        "not_needed_maybe_teachers": not_needed_maybe,
        "meeting_only_teachers": sorted(meeting_only, key=TEACHER_ORDER.index),
        "notes": notes,
    }


def render_markdown(result: dict) -> str:
    lines = []
    lines.append(f"# {result['date']} 担当案")
    lines.append("")
    lines.append(f"- 週: {result['week_index']}週目")
    lines.append(f"- 総会: {'あり' if result['meeting'] else 'なし'}")
    lines.append(f"- 王さん: {'参加' if result['wang_attends'] else '不参加'}")
    lines.append("")
    lines.append("## 担当")
    lines.append("")
    for class_name in result["classes"]:
        teacher = result["assignments"].get(class_name, "未定")
        lines.append(f"- {class_name}: {teacher}")
    lines.append("")
    lines.append("## 来る人")
    lines.append("")
    if result["selected_teachers"]:
        lines.append("- 担当で来る人: " + "、".join(result["selected_teachers"]))
    else:
        lines.append("- 担当で来る人: なし")
    if result["selected_maybe_teachers"]:
        lines.append("- 人数不足のため追加した人: " + "、".join(result["selected_maybe_teachers"]))
    else:
        lines.append("- 人数不足のため追加した人: なし")
    if result["not_needed_maybe_teachers"]:
        lines.append("- 人数が足りているため来なくてよい人: " + "、".join(result["not_needed_maybe_teachers"]))
    if result["meeting_only_teachers"]:
        lines.append("- 総会のみ参加: " + "、".join(result["meeting_only_teachers"]))
    if result["notes"]:
        lines.append("")
        lines.append("## 補足")
        lines.append("")
        for note in result["notes"]:
            lines.append(f"- {note}")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate daily rotation assignments from attendance data.")
    parser.add_argument("input", type=Path, help="Path to JSON input file")
    parser.add_argument("--json", action="store_true", help="Print raw JSON instead of Markdown")
    args = parser.parse_args()

    payload = json.loads(args.input.read_text(encoding="utf-8"))
    result = resolve_schedule(payload)
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(render_markdown(result))


if __name__ == "__main__":
    main()
