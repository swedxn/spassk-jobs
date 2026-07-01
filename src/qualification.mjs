export const isNoExperienceVacancy = vacancy => /без опыта|не требуется|готовы обуч|обучение|стаж[её]р|ученик/iu.test(`${vacancy?.experience || ''} ${vacancy?.description || ''}`);
