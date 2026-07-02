export const isNoExperienceVacancy = vacancy => /без опыта|не требуется|готовы обуч|обучение|стаж[её]р|ученик/iu.test(`${vacancy?.experience || ''} ${vacancy?.description || ''}`);

export const isNoHigherEducationVacancy = vacancy => !/высш(?:ее|его)|бакалавр|магистр/iu.test(`${vacancy?.education || ''} ${vacancy?.description || ''}`);

export function vacancyFacts(vacancy) {
  const facts = [];
  if (isNoExperienceVacancy(vacancy)) facts.push('Можно без опыта');
  if (isNoHigherEducationVacancy(vacancy)) {
    facts.push(/без высшего|средн|спо/iu.test(vacancy?.education || '')
      ? 'Высшее образование не требуется'
      : 'Высшее образование не указано');
  }
  if (vacancy?.salary && !/не указан/iu.test(vacancy.salary)) facts.push('Зарплата указана');
  if (vacancy?.schedule && !/не указан/iu.test(vacancy.schedule)) facts.push(`График: ${vacancy.schedule}`);
  return facts;
}
