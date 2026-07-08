export type FieldKind = "text" | "textarea";

export interface FormField {
  key: string;
  label: string;
  placeholder?: string;
  kind: FieldKind;
  required?: boolean;
}

export interface PositionDef {
  id: string;
  label: string;
  hint: string;
  defaults: Record<string, string>;
}

export interface ContractTypeDef {
  id: string;
  label: string;
  titleDefault: string;
  positions: PositionDef[];
  fields: FormField[];
}

const COMMON_LIABILITY = {
  supplier: "Пени за просрочку оплаты 0,1% в день (не более 10% суммы). Ограничение ответственности поставщика — фактически полученная оплата по спорной поставке.",
  buyer:
    "Пени за просрочку поставки 0,1% в день (не более 10% суммы). Право на отказ от товара ненадлежащего качества, возмещение убытков в пределах договорной цены.",
  contractor:
    "Оплата поэтапно по актам КС-2/КС-3. Изменение объёма — только допсоглашением. Ответственность подрядчика ограничена стоимостью этапа, за исключением умысла.",
  customer:
    "Гарантийный срок на результат работ — 24 месяца. Удержание 5% до окончания гарантии. Пени за просрочку — 0,1% в день.",
  gen_contractor:
    "Координация субподрядчиков, единый график. Ответственность перед заказчиком — солидарно с субподрядчиками в пределах их вины.",
  gen_customer:
    "Поэтапная приёмка, право приостановки оплаты при нарушении графика. Штраф за срыв сроков сдачи объекта — 0,15% в день.",
  sub_contractor:
    "Аванс 30%, оплата в течение 10 рабочих дней после подписания КС. Прямое требование к генподрядчику при просрочке оплаты заказчиком (если применимо). Ограничение ответственности — стоимость этапа.",
  sub_gen:
    "Back-to-back с договором с заказчиком. Субподрядчик обязан соблюдать график генподряда. Право зачёта при неисполнении субподрядчиком.",
  employer:
    "Испытательный срок — 3 месяца. Конфиденциальность, служебные произведения и ноу-хау принадлежат работодателю. Материальная ответственность — в пределах среднего месячного заработка.",
};

export const CONTRACT_TYPES: ContractTypeDef[] = [
  {
    id: "supply",
    label: "Договор поставки",
    titleDefault: "Договор поставки",
    positions: [
      {
        id: "supplier",
        label: "Мы — поставщик",
        hint: "Условия с приоритетом защиты поставщика",
        defaults: {
          parties: "Поставщик: [наша компания], ИНН…\nПокупатель: [контрагент], ИНН…",
          subject: "Поставка товара: [номенклатура], объём, требования к качеству (ГОСТ/ТУ)",
          payment_terms: "100% предоплата / оплата в течение 5 рабочих дней с даты счёта",
          delivery_terms: "Поставка в течение [N] дней с момента оплаты. Переход риска — при передаче перевозчику (EXW/FCA — уточнить)",
          warranty_terms: "Гарантия производителя. Претензии по качеству — в течение 5 рабочих дней с приёмки",
          liability_terms: COMMON_LIABILITY.supplier,
          special_terms: "Подсудность — по месту нахождения поставщика. Применимое право — РФ.",
        },
      },
      {
        id: "buyer",
        label: "Мы — покупатель",
        hint: "Условия с приоритетом защиты покупателя",
        defaults: {
          parties: "Покупатель: [наша компания], ИНН…\nПоставщик: [контрагент], ИНН…",
          subject: "Поставка товара: [номенклатура], объём, соответствие спецификации",
          payment_terms: "Оплата в течение 30 календарных дней после приёмки и подписания УПД",
          delivery_terms: "Поставка не позднее [дата]. Приёмка по количеству и качеству на складе покупателя",
          warranty_terms: "Гарантия не менее 12 месяцев. Замена/ремонт за счёт поставщика в течение 10 рабочих дней",
          liability_terms: COMMON_LIABILITY.buyer,
          special_terms: "Право одностороннего отказа при существенном нарушении. Подсудность — по месту нахождения покупателя.",
        },
      },
    ],
    fields: [
      { key: "parties", label: "Стороны и реквизиты", kind: "textarea", required: true, placeholder: "Поставщик / Покупатель, ИНН, представители" },
      { key: "subject", label: "Предмет (номенклатура)", kind: "textarea", required: true },
      { key: "price", label: "Цена / сумма", kind: "text", placeholder: "1 200 000 руб. с НДС" },
      { key: "payment_terms", label: "Условия оплаты", kind: "textarea" },
      { key: "delivery_terms", label: "Сроки и условия поставки", kind: "textarea" },
      { key: "warranty_terms", label: "Гарантии", kind: "textarea" },
      { key: "liability_terms", label: "Ответственность", kind: "textarea" },
      { key: "special_terms", label: "Особые условия", kind: "textarea" },
    ],
  },
  {
    id: "work",
    label: "Договор подряда",
    titleDefault: "Договор подряда",
    positions: [
      {
        id: "contractor",
        label: "Мы — подрядчик",
        hint: "Защита интересов исполнителя работ",
        defaults: {
          parties: "Подрядчик: [наша компания]\nЗаказчик: [контрагент]",
          subject: "Выполнение работ: [описание], результат — [объект/документация]",
          payment_terms: "Аванс 30%, остаток в течение 10 рабочих дней после подписания акта",
          timeline_terms: "Срок выполнения — [N] рабочих дней с даты аванса",
          acceptance_terms: "Приёмка по акту. Мотивированный отказ — в течение 5 рабочих дней",
          warranty_terms: "Гарантия на результат — 12 месяцев, на скрытые недостатки — 24 месяца",
          liability_terms: COMMON_LIABILITY.contractor,
          special_terms: "Изменение ТЗ — только письменным допсоглашением с пересмотром цены и сроков.",
        },
      },
      {
        id: "customer",
        label: "Мы — заказчик",
        hint: "Контроль сроков, качества и гарантий",
        defaults: {
          parties: "Заказчик: [наша компания]\nПодрядчик: [контрагент]",
          subject: "Выполнение работ: [описание], требования к результату",
          payment_terms: "Оплата по факту подписания актов, удержание 5% до окончания гарантии",
          timeline_terms: "Календарный график работ, промежуточные этапы",
          acceptance_terms: "Приёмка комиссией заказчика, право не принимать работы с недостатками",
          warranty_terms: "Гарантия не менее 24 месяцев на все виды работ",
          liability_terms: COMMON_LIABILITY.customer,
          special_terms: "Право привлечь третьих лиц за счёт подрядчика при срыве сроков.",
        },
      },
    ],
    fields: [
      { key: "parties", label: "Стороны", kind: "textarea", required: true },
      { key: "subject", label: "Предмет (объём работ)", kind: "textarea", required: true },
      { key: "price", label: "Цена / смета", kind: "text" },
      { key: "payment_terms", label: "Порядок расчётов", kind: "textarea" },
      { key: "timeline_terms", label: "Сроки выполнения", kind: "textarea" },
      { key: "acceptance_terms", label: "Приёмка работ", kind: "textarea" },
      { key: "warranty_terms", label: "Гарантии", kind: "textarea" },
      { key: "liability_terms", label: "Ответственность", kind: "textarea" },
      { key: "special_terms", label: "Особые условия", kind: "textarea" },
    ],
  },
  {
    id: "gen_contract",
    label: "Договор генподряда",
    titleDefault: "Договор генподряда",
    positions: [
      {
        id: "gen_contractor",
        label: "Мы — генподрядчик",
        hint: "Координация объекта и субподряд",
        defaults: {
          parties: "Генподрядчик: [наша компания]\nЗаказчик: [контрагент]",
          subject: "Строительство/реконструкция объекта: [адрес, характеристики]",
          payment_terms: "Оплата по графику выполнения, аванс на mobilization",
          timeline_terms: "Общий срок строительства — [дата]. Промежуточные вехи по календарному плану",
          subcontracting_terms: "Право привлечения субподрядчиков, ответственность генподрядчика перед заказчиком",
          warranty_terms: "Гарантия на объект — 5 лет на конструктив, 3 года на инженерные системы",
          liability_terms: COMMON_LIABILITY.gen_contractor,
          special_terms: "Риски изменения цен на материалы — порядок индексации.",
        },
      },
      {
        id: "gen_customer",
        label: "Мы — заказчик (застройщик)",
        hint: "Контроль сроков сдачи и качества объекта",
        defaults: {
          parties: "Заказчик: [наша компания]\nГенподрядчик: [контрагент]",
          subject: "Строительство объекта: [проект, адрес]",
          payment_terms: "Поэтапная оплата по КС, банковская гарантия на аванс",
          timeline_terms: "Сдача объекта не позднее [дата], штрафы за каждый день просрочки",
          subcontracting_terms: "Согласование субподрядчиков, право отказа от неблагонадёжных",
          warranty_terms: "Гарантийные обязательства не менее установленных законом сроков",
          liability_terms: COMMON_LIABILITY.gen_customer,
          special_terms: "Право одностороннего расторжения при существенном нарушении.",
        },
      },
    ],
    fields: [
      { key: "parties", label: "Стороны", kind: "textarea", required: true },
      { key: "subject", label: "Объект и объём работ", kind: "textarea", required: true },
      { key: "price", label: "Цена / смета", kind: "text" },
      { key: "payment_terms", label: "Порядок расчётов", kind: "textarea" },
      { key: "timeline_terms", label: "Сроки строительства", kind: "textarea" },
      { key: "subcontracting_terms", label: "Субподряд и координация", kind: "textarea" },
      { key: "warranty_terms", label: "Гарантии", kind: "textarea" },
      { key: "liability_terms", label: "Ответственность", kind: "textarea" },
      { key: "special_terms", label: "Особые условия", kind: "textarea" },
    ],
  },
  {
    id: "subcontract",
    label: "Договор субподряда",
    titleDefault: "Договор субподряда",
    positions: [
      {
        id: "sub_contractor",
        label: "Мы — субподрядчик",
        hint: "Максимальная защита субподрядчика (оплата, сроки, приёмка)",
        defaults: {
          parties: "Субподрядчик: [наша компания]\nГенподрядчик: [контрагент]",
          subject: "Выполнение работ по этапу: [вид работ, объём]",
          payment_terms: "Аванс 30%, оплата в течение 10 рабочих дней после КС. Независимость от оплаты генподрядчиком заказчиком — оговорить",
          timeline_terms: "Срок — [N] дней, продление при задержке передачи фронта работ генподрядчиком",
          acceptance_terms: "Приёмка в течение 5 рабочих дней, молчаливое согласие при отсутствии мотивированного отказа",
          warranty_terms: "Гарантия 12 месяцев, объём гарантийных работ — в пределах субподрядной цены",
          liability_terms: COMMON_LIABILITY.sub_contractor,
          special_terms: "Право приостановки работ при просрочке оплаты более 10 дней.",
        },
      },
      {
        id: "sub_gen",
        label: "Мы — генподрядчик",
        hint: "Back-to-back с договором с заказчиком",
        defaults: {
          parties: "Генподрядчик: [наша компания]\nСубподрядчик: [контрагент]",
          subject: "Субподрядные работы: [этап, объём]",
          payment_terms: "Оплата после оплаты заказчиком соответствующего этапа (back-to-back)",
          timeline_terms: "Сроки согласованы с графиком генподряда",
          acceptance_terms: "Приёмка с участием генподрядчика и заказчика при необходимости",
          warranty_terms: "Гарантия субподрядчика — не менее гарантии генподрядчика перед заказчиком",
          liability_terms: COMMON_LIABILITY.sub_gen,
          special_terms: "Субподрядчик обязан соблюдать требования охраны труда и техники безопасности на площадке.",
        },
      },
    ],
    fields: [
      { key: "parties", label: "Стороны", kind: "textarea", required: true },
      { key: "subject", label: "Предмет (объём субподрядных работ)", kind: "textarea", required: true },
      { key: "price", label: "Цена", kind: "text" },
      { key: "payment_terms", label: "Порядок расчётов", kind: "textarea" },
      { key: "timeline_terms", label: "Сроки", kind: "textarea" },
      { key: "acceptance_terms", label: "Приёмка", kind: "textarea" },
      { key: "warranty_terms", label: "Гарантии", kind: "textarea" },
      { key: "liability_terms", label: "Ответственность", kind: "textarea" },
      { key: "special_terms", label: "Особые условия", kind: "textarea" },
    ],
  },
  {
    id: "employment",
    label: "Трудовой договор",
    titleDefault: "Трудовой договор",
    positions: [
      {
        id: "employer",
        label: "Мы — работодатель",
        hint: "Типовой договор с защитой интересов компании",
        defaults: {
          employer_party: "Работодатель: [наша компания], ИНН…, в лице [должность, ФИО]",
          employee_party: "Работник: [ФИО], паспорт…",
          position_title: "Должность: [название по штатному расписанию]",
          subject: "Трудовые обязанности: [перечень или ссылка на должностную инструкцию]",
          salary: "Оклад [сумма] руб./мес., выплата 2 раза в месяц",
          work_schedule: "Пятидневная рабочая неделя, 40 часов, режим с [время] до [время]",
          vacation_terms: "28 календарных дней ежегодного оплачиваемого отпуска",
          probation_terms: "Испытательный срок — 3 месяца",
          liability_terms: COMMON_LIABILITY.employer,
          special_terms: "Конфиденциальность, служебные произведения — собственность работодателя. Применимое право — ТК РФ.",
        },
      },
    ],
    fields: [
      { key: "employer_party", label: "Работодатель", kind: "textarea", required: true },
      { key: "employee_party", label: "Работник", kind: "textarea", required: true },
      { key: "position_title", label: "Должность", kind: "text", required: true },
      { key: "subject", label: "Трудовые обязанности", kind: "textarea", required: true },
      { key: "salary", label: "Оплата труда", kind: "text" },
      { key: "work_schedule", label: "Режим работы", kind: "textarea" },
      { key: "vacation_terms", label: "Отпуск", kind: "textarea" },
      { key: "probation_terms", label: "Испытательный срок", kind: "textarea" },
      { key: "liability_terms", label: "Ответственность и конфиденциальность", kind: "textarea" },
      { key: "special_terms", label: "Прочие условия", kind: "textarea" },
    ],
  },
];

export function getContractType(id: string): ContractTypeDef {
  return CONTRACT_TYPES.find((t) => t.id === id) ?? CONTRACT_TYPES[0];
}

export function buildInitialValues(typeId: string, positionId: string): Record<string, string> {
  const type = getContractType(typeId);
  const position = type.positions.find((p) => p.id === positionId) ?? type.positions[0];
  const values: Record<string, string> = {};
  for (const field of type.fields) {
    values[field.key] = position.defaults[field.key] ?? "";
  }
  return values;
}

export function isFormValid(typeId: string, values: Record<string, string>): boolean {
  const type = getContractType(typeId);
  return type.fields
    .filter((f) => f.required)
    .every((f) => (values[f.key] ?? "").trim().length > 0);
}
