export const MEALS = {
  breakfast: { label: '早餐', caption: '开启好好吃饭的一天', icon: 'sunrise', tone: 'apricot' },
  lunch: { label: '午餐', caption: '忙碌中，也好好吃饭', icon: 'sun', tone: 'sage' },
  dinner: { label: '晚餐', caption: '用一餐，慢慢收好今天', icon: 'moon', tone: 'lavender' }
};
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function shiftDate(date, offset) {
  const parsed = new Date(`${date}T12:00:00`);
  parsed.setDate(parsed.getDate() + offset);
  return localDate(parsed);
}
export function weekDates(date) {
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const monday = shiftDate(date, -((weekday + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => shiftDate(monday, index));
}
export function daySummary(data, date) {
  const meals = data.meals.filter(record => record.date === date);
  const workouts = data.workouts.filter(record => record.date === date);
  const foods = meals.flatMap(record => record.foods);
  const known = foods.filter(food => food.kcal !== null && Number.isFinite(food.kcal));
  return {
    kcal: known.reduce((sum, food) => sum + food.kcal, 0),
    knownCount: known.length,
    unknownCount: foods.length - known.length,
    pendingCount: meals.filter(record => record.analysisStatus === 'pending').length,
    mealCount: new Set(meals.map(record => record.meal)).size,
    meals, workouts,
    cardioMinutes: workouts.filter(record => record.type === 'cardio').reduce((sum, record) => sum + record.minutes, 0)
  };
}
export function mealEnergy(record) {
  const known = record.foods.filter(food => food.kcal !== null && Number.isFinite(food.kcal));
  const kcal = known.reduce((sum, food) => sum + food.kcal, 0);
  return { kcal, unknown: known.length !== record.foods.length, known: known.length > 0 };
}
export function validateMeal(record) {
  if (!Object.prototype.hasOwnProperty.call(MEALS, record.meal)) return '请选择餐次。';
  if (!record.foods.length && !record.description.trim() && !record.photo) return '请描述吃了什么、添加照片，或手动添加食物。';
  if (record.foods.length > 30) return '每条记录最多添加 30 种食物。';
  for (const food of record.foods) {
    if (!food.name.trim()) return '请填写每项食物的名称。';
    if (food.name.length > 100 || food.portion.length > 100) return '食物名称或份量过长。';
    if (food.kcal !== null && (!Number.isFinite(food.kcal) || food.kcal < 0 || food.kcal > 20000)) return '热量应为 0 到 20000 之间的数字，或留空。';
  }
  if (record.description.length > 3000 || record.note.length > 2000) return '描述或备注过长，请适当缩短。';
  return '';
}
export function validateWorkout(record) {
  if (!record.name.trim()) return '请填写运动名称。';
  if (record.name.length > 100 || record.note.length > 2000) return '名称或备注过长。';
  if (record.type === 'cardio') {
    if (!Number.isFinite(record.minutes) || record.minutes < 1 || record.minutes > 1440) return '请填写 1 到 1440 之间的训练分钟数。';
  } else if (record.type === 'strength') {
    if (!Number.isInteger(record.sets) || record.sets < 1 || record.sets > 100) return '组数应为 1 到 100 的整数。';
    if (!Number.isInteger(record.reps) || record.reps < 1 || record.reps > 1000) return '每组次数应为 1 到 1000 的整数。';
    if (record.weight !== null && (!Number.isFinite(record.weight) || record.weight < 0 || record.weight > 2000)) return '重量应为 0 到 2000 之间的数字，或留空。';
  } else return '请选择训练类型。';
  return '';
}
export function validateTemplate(template) {
  if (!template.name.trim()) return '请填写模板名称，如练腿、练背。';
  if (template.name.length > 100) return '模板名称过长。';
  if (!Array.isArray(template.exercises) || !template.exercises.length || template.exercises.length > 30) return '每个模板需要 1 到 30 个动作。';
  for (let index = 0; index < template.exercises.length; index++) {
    const exercise = template.exercises[index];
    if (exercise.type !== 'strength') return `动作 ${index + 1}：模板只支持力量训练。`;
    const error = validateWorkout(exercise);
    if (error) return `动作 ${index + 1}：${error}`;
  }
  return '';
}
// Compare user-editable content; saving a template only adds updatedAt metadata.
function templateContent(template) {
  return JSON.stringify({ name: template.name, exercises: template.exercises.map(exercise => ({
    type: exercise.type ?? 'strength', name: exercise.name, sets: exercise.sets,
    reps: exercise.reps, weight: exercise.weight ?? null, note: exercise.note ?? ''
  })) });
}
export function upgradeTemplateDefaults(data, defaults, legacy, makeId) {
  if (data.templateDefaultsVersion >= 2 && Array.isArray(data.templates)) return data;
  const templates = JSON.parse(JSON.stringify(defaults));
  const presetIds = new Set([...defaults, ...legacy].map(template => template.id));
  const presets = [...defaults, ...legacy];
  for (const template of data.templates ?? []) {
    if (!presetIds.has(template.id)) templates.push(JSON.parse(JSON.stringify(template)));
    else if (!presets.some(preset => preset.id === template.id && templateContent(preset) === templateContent(template))) {
      templates.push({ ...JSON.parse(JSON.stringify(template)), id: makeId() });
    }
  }
  return { ...data, templateDefaultsVersion: 2, templates };
}
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
