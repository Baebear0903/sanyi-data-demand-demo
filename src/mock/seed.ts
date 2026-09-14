/**
 * 演示种子数据（Mock 数据中台）—— 由原 vanilla 版 seed.js 迁移而来，逻辑未改。
 *
 * 数据来源说明：
 *  · 资源名称取自《项目初设-建设方案》「表 100 现有数据来源目录」中的真实目录名；
 *    字段与样例数据为演示构造，示例值均已脱敏。
 *  · 上游系统数据（资源目录、数据服务、租户、CMDB、分类分级结果）按"对接态"模拟。
 *  · 全部数据由函数确定性生成，保证每次打开演示结果一致、可复现。
 */
import { roles as ROLES } from '../core/roles.ts'

const SECURITY_LEVEL_LABEL: Record<string, string> = {
  L1: 'L1 公开', L2: 'L2 内部', L3: 'L3 敏感', L4: 'L4 高敏感'
}

/* 基准时间：演示"当前时间"固定，保证数据一致 */
const NOW = new Date('2026-01-27T10:30:00')
/* 相对基准时间的偏移，输出 'YYYY-MM-DD HH:mm' */
function D(dayOffset: number, hour: number, minute: number): string {
  const d = new Date(NOW.getTime());
  d.setDate(d.getDate() + (dayOffset || 0));
  d.setHours(hour === undefined ? 9 : hour, minute || 0, 0, 0);
  const p = (n: number) => (n < 10 ? '0' + n : String(n))
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
function DD(dayOffset: number): string { return D(dayOffset, 9, 0).slice(0, 10) }
function pick<T>(arr: T[], i: number): T { return arr[((i % arr.length) + arr.length) % arr.length]; }
function seq(prefix: string, n: number, day: number): string { return prefix + '202601' + (day < 10 ? '0' + day : day) + String(n).padStart(3, '0'); }

/* ======================================================== 组织与人员 -- */
const ORGS = [
  { id: 'org01', name: '市卫生健康委员会', short: '市卫健委', type: '委办局', role: '供数方' },
  { id: 'org02', name: '市医疗保障局', short: '市医保局', type: '委办局', role: '用数方' },
  { id: 'org03', name: '市药品监督管理局', short: '市药监局', type: '委办局', role: '用数方' },
  { id: 'org04', name: '三医联动信息化工作领导小组办公室', short: '领导小组办公室', type: '协调机构', role: '审批方' },
  { id: 'org05', name: '三医数据底座服务台', short: '服务台', type: '服务组织', role: '服务台' },
  { id: 'org06', name: '运维中心', short: '运维中心', type: '运维组织', role: '运维方' },
  { id: 'org07', name: '数据生产中心', short: '生产中心', type: '生产部门', role: '生产方' },
  { id: 'org08', name: '平台运营中心', short: '运营中心', type: '运营组织', role: '平台管理' },
  { id: 'org09', name: '安全与合规管理处', short: '安全处', type: '安全组织', role: '安全审批' },
  { id: 'org10', name: '市应急管理局', short: '市应急局', type: '委办局', role: '用数方' },
  { id: 'org11', name: '市交通委员会', short: '市交通委', type: '委办局', role: '用数方' },
  { id: 'org12', name: '市疾病预防控制中心', short: '市疾控中心', type: '事业单位', role: '用数方' },
  { id: 'org13', name: '区全民健康信息平台（朝阳区）', short: '朝阳区平台', type: '区级平台', role: '供数方' },
  { id: 'org14', name: '北京大学第三医院', short: '北医三院', type: '医疗机构', role: '供数方' }
];

const USERS = [
  { id: 'u01', name: '李慧敏', org: '市医疗保障局', orgId: 'org02', title: '数据分析师', phone: '13800001001', email: 'lihm@ybj.beijing.gov.cn' },
  { id: 'u02', name: '张建国', org: '市卫生健康委员会', orgId: 'org01', title: '数据资源管理员', phone: '13800001002', email: 'zhangjg@wjw.beijing.gov.cn' },
  { id: 'u03', name: '王思远', org: '三医数据底座服务台', orgId: 'org05', title: '服务台受理员', phone: '13800001003', email: 'wangsy@sanyi-data.org.cn' },
  { id: 'u04', name: '陈志刚', org: '运维中心', orgId: 'org06', title: '高级运维工程师', phone: '13800001004', email: 'chenzg@sanyi-data.org.cn' },
  { id: 'u05', name: '刘涛', org: '数据生产中心', orgId: 'org07', title: '数据开发工程师', phone: '13800001005', email: 'liut@sanyi-data.org.cn' },
  { id: 'u06', name: '赵敏', org: '平台运营中心', orgId: 'org08', title: '平台管理员', phone: '13800001006', email: 'zhaom@sanyi-data.org.cn' },
  { id: 'u07', name: '孙立', org: '三医联动信息化工作领导小组办公室', orgId: 'org04', title: '协调专员', phone: '13800001007', email: 'sunl@sanyi-data.org.cn' },
  { id: 'u08', name: '周雅静', org: '安全与合规管理处', orgId: 'org09', title: '数据安全审批人', phone: '13800001008', email: 'zhouyj@sanyi-data.org.cn' },
  { id: 'u09', name: '吴强', org: '市药品监督管理局', orgId: 'org03', title: '业务分析师', phone: '13800001009', email: 'wuq@yjj.beijing.gov.cn' },
  { id: 'u10', name: '郑晓', org: '市疾病预防控制中心', orgId: 'org12', title: '监测科员', phone: '13800001010', email: 'zhengx@cdc.beijing.gov.cn' },
  { id: 'u11', name: '黄伟', org: '市应急管理局', orgId: 'org10', title: '应急指挥专员', phone: '13800001011', email: 'huangw@yjgl.beijing.gov.cn' },
  { id: 'u12', name: '林芳', org: '市交通委员会', orgId: 'org11', title: '综合规划处科员', phone: '13800001012', email: 'linf@jtj.beijing.gov.cn' },
  { id: 'u13', name: '徐鹏', org: '运维中心', orgId: 'org06', title: '一线运维工程师', phone: '13800001013', email: 'xup@sanyi-data.org.cn' },
  { id: 'u14', name: '何静', org: '数据生产中心', orgId: 'org07', title: '数据采集工程师', phone: '13800001014', email: 'hej@sanyi-data.org.cn' },
  { id: 'u15', name: '马超', org: '北京大学第三医院', orgId: 'org14', title: '信息科工程师', phone: '13800001015', email: 'mach@pku3h.org.cn' },
  { id: 'u16', name: '朱琳', org: '区全民健康信息平台（朝阳区）', orgId: 'org13', title: '平台运维', phone: '13800001016', email: 'zhul@chy-bj.org.cn' }
];

/* ============================================================ 租户 -- */
const TENANTS = [
  { id: 't01', name: '市医保局数据应用租户', type: '委办局', org: '市医疗保障局', apps: 3, createdAt: D(-320, 10, 0), status: '启用' },
  { id: 't02', name: '市药监局监管分析租户', type: '委办局', org: '市药品监督管理局', apps: 2, createdAt: D(-260, 14, 0), status: '启用' },
  { id: 't03', name: '市卫健委数据资源租户', type: '委办局', org: '市卫生健康委员会', apps: 4, createdAt: D(-400, 9, 0), status: '启用' },
  { id: 't04', name: '市疾控中心监测租户', type: '事业单位', org: '市疾病预防控制中心', apps: 1, createdAt: D(-150, 11, 0), status: '启用' },
  { id: 't05', name: '市应急管理局指挥租户', type: '委办局', org: '市应急管理局', apps: 1, createdAt: D(-90, 16, 0), status: '启用' }
];

const APPS = [
  { id: 'app01', name: '医保基金监管分析平台', tenantId: 't01', owner: '李慧敏', apiCount: 8, fileCount: 3, status: '已上线' },
  { id: 'app02', name: '医保参保画像应用', tenantId: 't01', owner: '李慧敏', apiCount: 5, fileCount: 1, status: '已上线' },
  { id: 'app03', name: '医保支付方式改革评估', tenantId: 't01', owner: '吴强', apiCount: 3, fileCount: 2, status: '审批中' },
  { id: 'app04', name: '药品不良反应监测', tenantId: 't02', owner: '吴强', apiCount: 4, fileCount: 1, status: '已上线' },
  { id: 'app05', name: '药品流通追溯分析', tenantId: 't02', owner: '吴强', apiCount: 2, fileCount: 0, status: '已上线' },
  { id: 'app06', name: '三医一张图可视化', tenantId: 't03', owner: '张建国', apiCount: 12, fileCount: 5, status: '已上线' },
  { id: 'app07', name: '医疗资源专题分析', tenantId: 't03', owner: '张建国', apiCount: 7, fileCount: 4, status: '已上线' },
  { id: 'app08', name: '传染病监测预警', tenantId: 't04', owner: '郑晓', apiCount: 6, fileCount: 2, status: '已上线' }
];

/* ====================================================== 资源目录 Mock -- */
/* type: MODEL(数据模型) / API(数据接口) / PARAM(标准参数) / ALGO(算法模型) / TAG(标签) / METRIC(指标) / RAW(数据资源)
   layer: ODS / DWD / DWA / DIM / SRC                                             */
const RESOURCES = [
  {
    id: 'r001', name: '医疗机构信息', code: 'dwd_org_medical_institution', type: 'MODEL', layer: 'DWD',
    domain: '医疗', source: '卫生健康委', owner: '市卫生健康委员会', securityLevel: 'L2',
    fields: [
      { name: 'org_code', cn: '机构代码', type: 'varchar(32)', sensitive: false },
      { name: 'org_name', cn: '机构名称', type: 'varchar(200)', sensitive: false },
      { name: 'org_level', cn: '机构级别', type: 'varchar(20)', sensitive: false },
      { name: 'org_type', cn: '机构类别', type: 'varchar(40)', sensitive: false },
      { name: 'district', cn: '所属区', type: 'varchar(40)', sensitive: false },
      { name: 'bed_count', cn: '实有床位', type: 'int', sensitive: false },
      { name: 'legal_person', cn: '法定代表人', type: 'varchar(60)', sensitive: true },
      { name: 'contact_phone', cn: '联系电话', type: 'varchar(20)', sensitive: true }
    ],
    rowCount: 1268, updateFreq: '每日', publishedAt: DD(-210), subscribeCount: 42, star: 4.6, viewCount: 3860,
    desc: '汇聚 240 家二级及以上医院、16 区卫健委区平台上报的医疗卫生机构基础信息，是三医主题库通用库核心实体。'
  },
  {
    id: 'r002', name: '医疗卫生人员信息', code: 'dwd_org_medical_staff', type: 'MODEL', layer: 'DWD',
    domain: '医疗', source: '卫生健康委', owner: '市卫生健康委员会', securityLevel: 'L3',
    fields: [
      { name: 'staff_id', cn: '人员标识', type: 'varchar(32)', sensitive: false },
      { name: 'staff_name', cn: '姓名', type: 'varchar(60)', sensitive: true },
      { name: 'id_card', cn: '身份证号', type: 'varchar(18)', sensitive: true },
      { name: 'org_code', cn: '所属机构', type: 'varchar(32)', sensitive: false },
      { name: 'dept_name', cn: '所属科室', type: 'varchar(80)', sensitive: false },
      { name: 'title', cn: '专业技术职称', type: 'varchar(40)', sensitive: false },
      { name: 'practice_no', cn: '执业证书编号', type: 'varchar(40)', sensitive: true },
      { name: 'mobile', cn: '手机号', type: 'varchar(20)', sensitive: true }
    ],
    rowCount: 486320, updateFreq: '每日', publishedAt: DD(-205), subscribeCount: 28, star: 4.2, viewCount: 2140,
    desc: '医护人员基础信息与执业注册信息，含身份证、手机号等个人敏感字段，需脱敏后使用。'
  },
  {
    id: 'r003', name: '门急诊就诊记录', code: 'dwd_visit_outpatient', type: 'MODEL', layer: 'DWD',
    domain: '医疗', source: '卫生健康委', owner: '市卫生健康委员会', securityLevel: 'L3',
    fields: [
      { name: 'visit_no', cn: '就诊流水号', type: 'varchar(40)', sensitive: false },
      { name: 'patient_id', cn: '患者标识', type: 'varchar(32)', sensitive: true },
      { name: 'id_card', cn: '身份证号', type: 'varchar(18)', sensitive: true },
      { name: 'visit_date', cn: '就诊日期', type: 'date', sensitive: false },
      { name: 'dept_name', cn: '就诊科室', type: 'varchar(80)', sensitive: false },
      { name: 'diagnosis_code', cn: '诊断编码(ICD-10)', type: 'varchar(20)', sensitive: false },
      { name: 'diagnosis_name', cn: '诊断名称', type: 'varchar(200)', sensitive: false },
      { name: 'fee_total', cn: '费用总额', type: 'decimal(12,2)', sensitive: false },
      { name: 'insurance_type', cn: '医保类型', type: 'varchar(30)', sensitive: false }
    ],
    rowCount: 86421350, updateFreq: '每日增量', publishedAt: DD(-198), subscribeCount: 56, star: 4.8, viewCount: 6420,
    desc: '全市二级及以上医院门急诊就诊明细，支撑就医流向分析、疾病谱分析与费用分析。'
  },
  {
    id: 'r004', name: '住院记录信息', code: 'dwd_visit_inpatient', type: 'MODEL', layer: 'DWD',
    domain: '医疗', source: '卫生健康委', owner: '市卫生健康委员会', securityLevel: 'L3',
    fields: [
      { name: 'inp_no', cn: '住院流水号', type: 'varchar(40)', sensitive: false },
      { name: 'patient_id', cn: '患者标识', type: 'varchar(32)', sensitive: true },
      { name: 'admit_date', cn: '入院日期', type: 'date', sensitive: false },
      { name: 'discharge_date', cn: '出院日期', type: 'date', sensitive: false },
      { name: 'main_diag', cn: '主要诊断', type: 'varchar(200)', sensitive: false },
      { name: 'operation_name', cn: '手术名称', type: 'varchar(200)', sensitive: false },
      { name: 'los_days', cn: '住院天数', type: 'int', sensitive: false },
      { name: 'fee_total', cn: '住院费用', type: 'decimal(12,2)', sensitive: false }
    ],
    rowCount: 5820460, updateFreq: '每日增量', publishedAt: DD(-196), subscribeCount: 34, star: 4.5, viewCount: 2980,
    desc: '住院就诊记录，支撑平均住院日、次均费用、重点手术等指标计算。'
  },
  {
    id: 'r005', name: '药品基本信息', code: 'dim_drug_base', type: 'PARAM', layer: 'DIM',
    domain: '医药', source: '药监局', owner: '市药品监督管理局', securityLevel: 'L1',
    fields: [
      { name: 'drug_code', cn: '药品编码', type: 'varchar(32)', sensitive: false },
      { name: 'drug_name', cn: '药品通用名', type: 'varchar(200)', sensitive: false },
      { name: 'trade_name', cn: '商品名', type: 'varchar(200)', sensitive: false },
      { name: 'dosage_form', cn: '剂型', type: 'varchar(40)', sensitive: false },
      { name: 'spec', cn: '规格', type: 'varchar(80)', sensitive: false },
      { name: 'manufacturer', cn: '生产企业', type: 'varchar(200)', sensitive: false },
      { name: 'approval_no', cn: '批准文号', type: 'varchar(60)', sensitive: false }
    ],
    rowCount: 186420, updateFreq: '每周', publishedAt: DD(-230), subscribeCount: 62, star: 4.9, viewCount: 5240,
    desc: '三医主数据标准药品字典，作为药品贯标与医保目录对应关系的基准参数。'
  },
  {
    id: 'r006', name: '医保参保人员信息', code: 'dwd_mi_insured_person', type: 'MODEL', layer: 'DWD',
    domain: '医保', source: '医保局', owner: '市医疗保障局', securityLevel: 'L4',
    fields: [
      { name: 'insured_id', cn: '参保人标识', type: 'varchar(32)', sensitive: false },
      { name: 'name', cn: '姓名', type: 'varchar(60)', sensitive: true },
      { name: 'id_card', cn: '身份证号', type: 'varchar(18)', sensitive: true },
      { name: 'gender', cn: '性别', type: 'varchar(4)', sensitive: false },
      { name: 'birth_date', cn: '出生日期', type: 'date', sensitive: true },
      { name: 'insured_type', cn: '参保类型', type: 'varchar(30)', sensitive: false },
      { name: 'employer', cn: '参保单位', type: 'varchar(200)', sensitive: true },
      { name: 'bank_account', cn: '银行账户', type: 'varchar(40)', sensitive: true }
    ],
    rowCount: 21846300, updateFreq: '每日增量', publishedAt: DD(-180), subscribeCount: 18, star: 4.4, viewCount: 1560,
    desc: '医保参保人员基础信息，属高敏感数据，仅可通过沙箱或脱敏后使用，访问需多级安全审批。'
  },
  {
    id: 'r007', name: '医保结算信息', code: 'dwd_mi_settlement', type: 'MODEL', layer: 'DWD',
    domain: '医保', source: '医保局', owner: '市医疗保障局', securityLevel: 'L3',
    fields: [
      { name: 'settle_no', cn: '结算流水号', type: 'varchar(40)', sensitive: false },
      { name: 'insured_id', cn: '参保人标识', type: 'varchar(32)', sensitive: true },
      { name: 'settle_date', cn: '结算日期', type: 'date', sensitive: false },
      { name: 'org_code', cn: '定点医疗机构', type: 'varchar(32)', sensitive: false },
      { name: 'total_fee', cn: '医疗总费用', type: 'decimal(12,2)', sensitive: false },
      { name: 'fund_pay', cn: '基金支付', type: 'decimal(12,2)', sensitive: false },
      { name: 'self_pay', cn: '个人自付', type: 'decimal(12,2)', sensitive: false },
      { name: 'settle_type', cn: '结算类别', type: 'varchar(30)', sensitive: false }
    ],
    rowCount: 42680150, updateFreq: '每日增量', publishedAt: DD(-175), subscribeCount: 31, star: 4.3, viewCount: 2410,
    desc: '医保结算明细，支撑基金监管、支付方式改革评估等场景。'
  },
  {
    id: 'r008', name: '药品不良反应信息', code: 'dwd_adr_report', type: 'MODEL', layer: 'DWD',
    domain: '医药', source: '药监局', owner: '市药品监督管理局', securityLevel: 'L3',
    fields: [
      { name: 'adr_no', cn: '报告编号', type: 'varchar(40)', sensitive: false },
      { name: 'drug_code', cn: '怀疑药品', type: 'varchar(32)', sensitive: false },
      { name: 'patient_id', cn: '患者标识', type: 'varchar(32)', sensitive: true },
      { name: 'reaction', cn: '不良反应表现', type: 'varchar(500)', sensitive: false },
      { name: 'severity', cn: '严重程度', type: 'varchar(20)', sensitive: false },
      { name: 'report_date', cn: '报告日期', type: 'date', sensitive: false },
      { name: 'report_org', cn: '报告单位', type: 'varchar(200)', sensitive: false }
    ],
    rowCount: 286400, updateFreq: '每日', publishedAt: DD(-168), subscribeCount: 22, star: 4.1, viewCount: 1320,
    desc: '药品不良反应监测报告，支撑药械不良反应专题库与药品安全监管。'
  },
  {
    id: 'r009', name: '血液采集与供应信息', code: 'dwd_blood_supply', type: 'MODEL', layer: 'DWD',
    domain: '医疗', source: '卫生健康委', owner: '市卫生健康委员会', securityLevel: 'L2',
    fields: [
      { name: 'blood_no', cn: '血袋编号', type: 'varchar(40)', sensitive: false },
      { name: 'blood_type', cn: '血型', type: 'varchar(10)', sensitive: false },
      { name: 'collect_date', cn: '采集日期', type: 'date', sensitive: false },
      { name: 'component', cn: '血液成分', type: 'varchar(40)', sensitive: false },
      { name: 'supply_org', cn: '供应机构', type: 'varchar(200)', sensitive: false },
      { name: 'test_result', cn: '检测结论', type: 'varchar(40)', sensitive: false }
    ],
    rowCount: 1268000, updateFreq: '每日', publishedAt: DD(-160), subscribeCount: 12, star: 3.9, viewCount: 860,
    desc: '血液采集、制备、检测及供应信息，支撑血液管理专题分析。'
  },
  {
    id: 'r010', name: '传染病报告信息', code: 'dwd_infectious_report', type: 'MODEL', layer: 'DWD',
    domain: '医疗', source: '卫生健康委', owner: '市卫生健康委员会', securityLevel: 'L3',
    fields: [
      { name: 'report_no', cn: '报告卡编号', type: 'varchar(40)', sensitive: false },
      { name: 'patient_id', cn: '患者标识', type: 'varchar(32)', sensitive: true },
      { name: 'disease_code', cn: '疾病编码', type: 'varchar(20)', sensitive: false },
      { name: 'disease_name', cn: '疾病名称', type: 'varchar(80)', sensitive: false },
      { name: 'onset_date', cn: '发病日期', type: 'date', sensitive: false },
      { name: 'report_date', cn: '报告日期', type: 'date', sensitive: false },
      { name: 'report_org', cn: '报告单位', type: 'varchar(200)', sensitive: false },
      { name: 'case_type', cn: '病例分类', type: 'varchar(30)', sensitive: false }
    ],
    rowCount: 426800, updateFreq: '每日', publishedAt: DD(-155), subscribeCount: 26, star: 4.6, viewCount: 1980,
    desc: '法定传染病报告信息，支撑传染病监测预警与疾控分析。'
  },
  {
    id: 'r011', name: '单表查询API-医疗机构信息查询', code: 'api_org_query', type: 'API', layer: 'SRC',
    domain: '医疗', source: '数据资源管理与服务', owner: '市卫生健康委员会', securityLevel: 'L2',
    fields: [
      { name: 'org_code', cn: '机构代码(入参)', type: 'varchar(32)', sensitive: false },
      { name: 'district', cn: '所属区(入参)', type: 'varchar(40)', sensitive: false },
      { name: 'org_name', cn: '机构名称(出参)', type: 'varchar(200)', sensitive: false },
      { name: 'bed_count', cn: '实有床位(出参)', type: 'int', sensitive: false }
    ],
    rowCount: 0, updateFreq: '实时', publishedAt: DD(-140), subscribeCount: 24, star: 4.5, viewCount: 1860,
    desc: '单表查询类 API 服务，按机构代码或所属区查询医疗卫生机构信息，GET /open/api/v1/org/query。'
  },
  {
    id: 'r012', name: '组合查询API-门急诊费用统计', code: 'api_visit_fee_stat', type: 'API', layer: 'SRC',
    domain: '医疗', source: '数据资源管理与服务', owner: '市卫生健康委员会', securityLevel: 'L3',
    fields: [
      { name: 'start_date', cn: '开始日期(入参)', type: 'date', sensitive: false },
      { name: 'end_date', cn: '结束日期(入参)', type: 'date', sensitive: false },
      { name: 'district', cn: '所属区(入参)', type: 'varchar(40)', sensitive: false },
      { name: 'visit_count', cn: '就诊人次(出参)', type: 'bigint', sensitive: false },
      { name: 'fee_total', cn: '费用合计(出参)', type: 'decimal(16,2)', sensitive: false }
    ],
    rowCount: 0, updateFreq: '实时', publishedAt: DD(-120), subscribeCount: 19, star: 4.2, viewCount: 1240,
    desc: '基于自定义 SQL 封装的组合查询 API，POST /open/api/v1/visit/feeStat。'
  },
  {
    id: 'r013', name: '医疗资源专题指标集', code: 'metric_medical_resource', type: 'METRIC', layer: 'DWA',
    domain: '医疗', source: '数据资源管理与服务', owner: '市卫生健康委员会', securityLevel: 'L1',
    fields: [
      { name: 'metric_code', cn: '指标编码', type: 'varchar(40)', sensitive: false },
      { name: 'metric_name', cn: '指标名称', type: 'varchar(120)', sensitive: false },
      { name: 'stat_period', cn: '统计周期', type: 'varchar(20)', sensitive: false },
      { name: 'metric_value', cn: '指标值', type: 'decimal(18,4)', sensitive: false },
      { name: 'district', cn: '所属区', type: 'varchar(40)', sensitive: false }
    ],
    rowCount: 86400, updateFreq: '每日', publishedAt: DD(-150), subscribeCount: 38, star: 4.7, viewCount: 3120,
    desc: '医疗卫生机构数、床位数、卫生人员数、每千人口床位数等 32 项医疗资源类指标。'
  },
  {
    id: 'r014', name: '慢病管理标签体系', code: 'tag_chronic_disease', type: 'TAG', layer: 'DWA',
    domain: '医疗', source: '医疗公司标签体系', owner: '市卫生健康委员会', securityLevel: 'L3',
    fields: [
      { name: 'subject_id', cn: '主体标识', type: 'varchar(32)', sensitive: true },
      { name: 'tag_code', cn: '标签编码', type: 'varchar(40)', sensitive: false },
      { name: 'tag_name', cn: '标签名称', type: 'varchar(80)', sensitive: false },
      { name: 'tag_value', cn: '标签值', type: 'varchar(200)', sensitive: false },
      { name: 'update_time', cn: '更新日期', type: 'date', sensitive: false }
    ],
    rowCount: 3860000, updateFreq: '每日', publishedAt: DD(-110), subscribeCount: 16, star: 4.0, viewCount: 980,
    desc: '高血压、糖尿病等慢病管理标签，来源于三医标签体系，支撑慢病业务与妇幼保健专题分析。'
  },
  {
    id: 'r015', name: '疾病风险预测模型', code: 'algo_disease_risk', type: 'ALGO', layer: 'DWA',
    domain: '医疗', source: '医疗公司标签体系', owner: '市卫生健康委员会', securityLevel: 'L2',
    fields: [
      { name: 'model_version', cn: '模型版本', type: 'varchar(20)', sensitive: false },
      { name: 'input_features', cn: '输入特征', type: 'varchar(500)', sensitive: false },
      { name: 'output_score', cn: '风险评分', type: 'decimal(6,4)', sensitive: false },
      { name: 'auc', cn: '模型 AUC', type: 'decimal(6,4)', sensitive: false }
    ],
    rowCount: 0, updateFreq: '每月', publishedAt: DD(-95), subscribeCount: 9, star: 3.8, viewCount: 620,
    desc: '基于多病种特征的疾病风险预测算法模型资源，支撑重点疾病专题与辅助决策场景。'
  },
  {
    id: 'r016', name: '区级全民健康平台上报数据（朝阳区）', code: 'ods_cy_health_platform', type: 'RAW', layer: 'ODS',
    domain: '医疗', source: '区卫健委', owner: '区全民健康信息平台（朝阳区）', securityLevel: 'L3',
    fields: [
      { name: 'batch_no', cn: '上报批次', type: 'varchar(40)', sensitive: false },
      { name: 'table_name', cn: '业务表名', type: 'varchar(120)', sensitive: false },
      { name: 'record_count', cn: '记录数', type: 'bigint', sensitive: false },
      { name: 'report_time', cn: '上报时间', type: 'datetime', sensitive: false }
    ],
    rowCount: 12680000, updateFreq: '每日', publishedAt: DD(-88), subscribeCount: 8, star: 3.6, viewCount: 520,
    desc: '区全民健康信息平台按日上报的原始数据批次，覆盖区基层医疗卫生机构业务数据。'
  },
  {
    id: 'r017', name: '体检机构体检结果信息', code: 'dwd_checkup_result', type: 'MODEL', layer: 'DWD',
    domain: '医疗', source: '体检机构', owner: '市卫生健康委员会', securityLevel: 'L3',
    fields: [
      { name: 'checkup_no', cn: '体检流水号', type: 'varchar(40)', sensitive: false },
      { name: 'person_id', cn: '受检人标识', type: 'varchar(32)', sensitive: true },
      { name: 'checkup_date', cn: '体检日期', type: 'date', sensitive: false },
      { name: 'item_name', cn: '体检项目', type: 'varchar(120)', sensitive: false },
      { name: 'result_value', cn: '结果值', type: 'varchar(120)', sensitive: false },
      { name: 'conclusion', cn: '体检结论', type: 'varchar(500)', sensitive: false }
    ],
    rowCount: 4268000, updateFreq: '每周', publishedAt: DD(-80), subscribeCount: 11, star: 3.7, viewCount: 680,
    desc: '35 家独立体检机构上报的公众体检数据，支撑健康体检专题分析。'
  },
  {
    id: 'r018', name: '急救调度信息', code: 'dwd_emergency_dispatch', type: 'MODEL', layer: 'DWD',
    domain: '医疗', source: '卫生健康委', owner: '市卫生健康委员会', securityLevel: 'L2',
    fields: [
      { name: 'dispatch_no', cn: '调度单号', type: 'varchar(40)', sensitive: false },
      { name: 'call_time', cn: '呼救时间', type: 'datetime', sensitive: false },
      { name: 'arrive_time', cn: '到达现场时间', type: 'datetime', sensitive: false },
      { name: 'patient_id', cn: '患者标识', type: 'varchar(32)', sensitive: true },
      { name: 'destination', cn: '送达医院', type: 'varchar(200)', sensitive: false },
      { name: 'response_min', cn: '响应时长(分钟)', type: 'int', sensitive: false }
    ],
    rowCount: 682000, updateFreq: '每日', publishedAt: DD(-72), subscribeCount: 14, star: 4.0, viewCount: 740,
    desc: '120 急救调度信息，支撑急救资源与响应时效分析。'
  },
  {
    id: 'r019', name: '妇幼保健业务信息', code: 'dwd_mch_service', type: 'MODEL', layer: 'DWD',
    domain: '医疗', source: '卫生健康委', owner: '市卫生健康委员会', securityLevel: 'L4',
    fields: [
      { name: 'service_no', cn: '服务流水号', type: 'varchar(40)', sensitive: false },
      { name: 'mother_id', cn: '母亲标识', type: 'varchar(32)', sensitive: true },
      { name: 'baby_id', cn: '婴儿标识', type: 'varchar(32)', sensitive: true },
      { name: 'service_type', cn: '服务类型', type: 'varchar(60)', sensitive: false },
      { name: 'service_date', cn: '服务日期', type: 'date', sensitive: false },
      { name: 'org_code', cn: '服务机构', type: 'varchar(32)', sensitive: false }
    ],
    rowCount: 2860000, updateFreq: '每日', publishedAt: DD(-66), subscribeCount: 10, star: 3.9, viewCount: 610,
    desc: '妇幼保健业务数据，含母婴标识等敏感字段，需按最小权限原则授权使用。'
  },
  {
    id: 'r020', name: '医疗器械与医用材料信息', code: 'dim_device_material', type: 'PARAM', layer: 'DIM',
    domain: '医药', source: '药监局', owner: '市药品监督管理局', securityLevel: 'L1',
    fields: [
      { name: 'device_code', cn: '器械编码', type: 'varchar(32)', sensitive: false },
      { name: 'device_name', cn: '器械名称', type: 'varchar(200)', sensitive: false },
      { name: 'material_name', cn: '医用材料名称', type: 'varchar(200)', sensitive: false },
      { name: 'class_level', cn: '管理类别', type: 'varchar(20)', sensitive: false },
      { name: 'manufacturer', cn: '生产企业', type: 'varchar(200)', sensitive: false },
      { name: 'reg_no', cn: '注册证号', type: 'varchar(60)', sensitive: false }
    ],
    rowCount: 96400, updateFreq: '每周', publishedAt: DD(-60), subscribeCount: 15, star: 4.1, viewCount: 720,
    desc: '医疗器械与医用材料主数据字典，支撑器械不良反应与采购分析。'
  }
];

/* 资源与分类分级结果（对接「数据分类分级」系统，演示态） */
const MASK_BY_LEVEL: Record<string, string> = { L1: '不脱敏', L2: '掩码', L3: '掩码', L4: 'SM4加密' };
const CLASSIFICATIONS = RESOURCES.map(function (r, i) {
  const cats: Record<string, string> = { 医疗: '医疗卫生数据', 医保: '医疗保障数据', 医药: '药品器械数据', 通用: '公共基础数据' };
  return {
    resourceId: r.id, category: cats[r.domain] || '医疗卫生数据', level: r.securityLevel,
    levelName: SECURITY_LEVEL_LABEL[r.securityLevel as string],
    maskAlgorithm: MASK_BY_LEVEL[r.securityLevel as string],
    evaluatedAt: D(-Math.abs(30 + i * 2), 2, 0),
    source: i % 4 === 0 ? '人工评估' : '自动评估',
    ruleName: '三医数据分类分级规则库 v2.1',
    legalBasis: pick(['《数据安全法》', '《个人信息保护法》', '《北京市公共数据管理办法》', '《医疗卫生机构网络安全管理办法》'], i),
    hitRules: r.securityLevel === 'L4' ? ['身份证号识别', '银行账户识别', '生物识别信息']
      : r.securityLevel === 'L3' ? ['身份证号识别', '手机号识别', '就诊标识识别']
        : r.securityLevel === 'L2' ? ['机构联系信息'] : ['无敏感命中']
  };
});

/* 样例数据（按敏感级别在前端脱敏展示） */
const SAMPLES = {
  r001: [
    { org_code: 'BJ-H-0001', org_name: '北京***医院', org_level: '三级甲等', org_type: '综合医院', district: '西城区', bed_count: 1820, legal_person: '王**', contact_phone: '010-8****1234' },
    { org_code: 'BJ-H-0002', org_name: '北京***医院', org_level: '三级甲等', org_type: '专科医院', district: '海淀区', bed_count: 960, legal_person: '李**', contact_phone: '010-6****5678' }
  ],
  r002: [
    { staff_id: 'STF000018624', staff_name: '张**', id_card: '1101**********1234', org_code: 'BJ-H-0001', dept_name: '心血管内科', title: '主任医师', practice_no: '1101******2018', mobile: '138****6721' },
    { staff_id: 'STF000018625', staff_name: '刘**', id_card: '1101**********5678', org_code: 'BJ-H-0001', dept_name: '呼吸内科', title: '副主任医师', practice_no: '1101******2019', mobile: '139****8834' }
  ],
  r003: [
    { visit_no: 'OP202601200001', patient_id: 'PT******4821', id_card: '1101**********4821', visit_date: '2026-01-20', dept_name: '心血管内科', diagnosis_code: 'I10', diagnosis_name: '原发性高血压', fee_total: '386.50', insurance_type: '城镇职工医保' },
    { visit_no: 'OP202601200002', patient_id: 'PT******7735', id_card: '1101**********7735', visit_date: '2026-01-20', dept_name: '内分泌科', diagnosis_code: 'E11', diagnosis_name: '2型糖尿病', fee_total: '542.80', insurance_type: '城乡居民医保' }
  ],
  r005: [
    { drug_code: 'DRG0001842', drug_name: '阿莫西林胶囊', trade_name: '阿莫仙', dosage_form: '胶囊剂', spec: '0.25g*24粒', manufacturer: '***制药有限公司', approval_no: '国药准字H****1234' }
  ],
  r006: [
    { insured_id: 'MI******9012', name: '陈**', id_card: '1101**********9012', gender: '男', birth_date: '1972-**-**', insured_type: '城镇职工医保', employer: '***有限公司', bank_account: '6222 **** **** 4821' }
  ],
  r007: [
    { settle_no: 'ST202601200001', insured_id: 'MI******9012', settle_date: '2026-01-20', org_code: 'BJ-H-0001', total_fee: '1,286.40', fund_pay: '964.80', self_pay: '321.60', settle_type: '普通门诊' }
  ],
  r011: [
    { org_code: 'BJ-H-0001', district: '西城区', org_name: '北京***医院', bed_count: 1820 }
  ]
};

/* ================================================== 数据服务目录 Mock -- */
const SERVICES = [
  { id: 'sv01', name: '医疗机构信息查询服务', kind: 'API', resourceId: 'r011', publisher: '市卫生健康委员会', status: 'ONLINE', availability: '99.9%', serviceTime: '7×24 小时', subscribeCount: 24, callVolume: 1864200, publishAt: DD(-138), desc: '按机构代码 / 所属区查询医疗卫生机构基础信息' },
  { id: 'sv02', name: '门急诊费用统计服务', kind: 'API', resourceId: 'r012', publisher: '市卫生健康委员会', status: 'ONLINE', availability: '99.5%', serviceTime: '7×24 小时', subscribeCount: 19, callVolume: 862400, publishAt: DD(-118), desc: '按日期区间与行政区统计门急诊人次与费用' },
  { id: 'sv03', name: '门急诊就诊明细查询服务', kind: 'API', resourceId: 'r003', publisher: '市卫生健康委员会', status: 'ONLINE', availability: '99.8%', serviceTime: '7×24 小时', subscribeCount: 31, callVolume: 2648000, publishAt: DD(-190), desc: '按就诊日期范围查询脱敏后的门急诊就诊明细' },
  { id: 'sv04', name: '医保结算信息查询服务', kind: 'API', resourceId: 'r007', publisher: '市医疗保障局', status: 'ONLINE', availability: '99.9%', serviceTime: '7×24 小时', subscribeCount: 22, callVolume: 1246000, publishAt: DD(-170), desc: '医保结算明细查询，敏感字段按分级规则脱敏' },
  { id: 'sv05', name: '药品基本信息查询服务', kind: 'API', resourceId: 'r005', publisher: '市药品监督管理局', status: 'ONLINE', availability: '99.9%', serviceTime: '7×24 小时', subscribeCount: 36, callVolume: 986000, publishAt: DD(-225), desc: '三医主数据标准药品字典查询' },
  { id: 'sv06', name: '医疗卫生人员执业信息核验服务', kind: 'API', resourceId: 'r002', publisher: '市卫生健康委员会', status: 'DISABLED', availability: '99.0%', serviceTime: '工作日 08:00-18:00', subscribeCount: 8, callVolume: 126800, publishAt: DD(-200), desc: '医师 / 护士执业信息核验，因安全评估暂停对外服务' },
  { id: 'sv07', name: '医疗机构信息全量文件服务', kind: 'FILE', resourceId: 'r001', publisher: '市卫生健康委员会', status: 'ONLINE', availability: '99.5%', serviceTime: '每日 02:00 下发', subscribeCount: 16, callVolume: 0, publishAt: DD(-135), desc: '按日全量下发医疗卫生机构信息文件（CSV，分包压缩）' },
  { id: 'sv08', name: '医疗资源指标日度文件服务', kind: 'FILE', resourceId: 'r013', publisher: '市卫生健康委员会', status: 'ONLINE', availability: '99.5%', serviceTime: '每日 03:00 下发', subscribeCount: 21, callVolume: 0, publishAt: DD(-148), desc: '32 项医疗资源指标日度快照文件下发' },
  { id: 'sv09', name: '医保结算信息增量文件服务', kind: 'FILE', resourceId: 'r007', publisher: '市医疗保障局', status: 'ONLINE', availability: '99.5%', serviceTime: '每日 04:00 下发', subscribeCount: 12, callVolume: 0, publishAt: DD(-160), desc: '医保结算增量数据文件下发，敏感资源采用 SFTP 方式' },
  { id: 'sv10', name: '门急诊就诊实时推送服务', kind: 'REALTIME', resourceId: 'r003', publisher: '市卫生健康委员会', status: 'ONLINE', availability: '99.9%', serviceTime: '7×24 小时', subscribeCount: 9, callVolume: 42680000, publishAt: DD(-105), desc: '门急诊就诊记录实时推送（Flink 作业），脱敏后下发' },
  { id: 'sv11', name: '传染病报告实时推送服务', kind: 'REALTIME', resourceId: 'r010', publisher: '市卫生健康委员会', status: 'ONLINE', availability: '99.9%', serviceTime: '7×24 小时', subscribeCount: 7, callVolume: 1286000, publishAt: DD(-100), desc: '传染病报告实时推送，支撑疾控监测预警' },
  { id: 'sv12', name: '服务编排API-三医综合查询', kind: 'API', resourceId: 'r011', publisher: '平台运营中心', status: 'ONLINE', availability: '99.7%', serviceTime: '7×24 小时', subscribeCount: 11, callVolume: 342000, publishAt: DD(-70), desc: '编排医疗机构、卫生人员、药品三个 API 的组合查询服务' }
];

/* ==================================================== CMDB 配置项 Mock -- */
const CIS = [
  { id: 'ci01', name: '三医数据底座-生产集群', type: '集群', owner: '运维中心', env: '生产', dependsOn: [], relatedTenants: ['t01', 't02', 't03', 't04', 't05'], relatedServices: ['sv01', 'sv02', 'sv03', 'sv04', 'sv05'] },
  { id: 'ci02', name: 'DORIS 分析型数据库', type: '数据库', owner: '运维中心', env: '生产', dependsOn: ['ci01'], relatedTenants: ['t01', 't03'], relatedServices: ['sv02', 'sv03', 'sv08'] },
  { id: 'ci03', name: 'HIVE 数据仓库', type: '数据库', owner: '运维中心', env: '生产', dependsOn: ['ci01'], relatedTenants: ['t03'], relatedServices: ['sv07', 'sv10'] },
  { id: 'ci04', name: 'dwd_org_medical_institution', type: '数据表', owner: '数据生产中心', env: '生产', dependsOn: ['ci03'], relatedTenants: ['t01', 't02'], relatedServices: ['sv01', 'sv07'] },
  { id: 'ci05', name: 'dwd_visit_outpatient', type: '数据表', owner: '数据生产中心', env: '生产', dependsOn: ['ci03'], relatedTenants: ['t01'], relatedServices: ['sv03', 'sv10'] },
  { id: 'ci06', name: 'dwd_mi_settlement', type: '数据表', owner: '数据生产中心', env: '生产', dependsOn: ['ci02'], relatedTenants: ['t01'], relatedServices: ['sv04', 'sv09'] },
  { id: 'ci07', name: '医疗机构信息查询服务', type: 'API服务', owner: '平台运营中心', env: '生产', dependsOn: ['ci04'], relatedTenants: ['t01', 't02', 't04'], relatedServices: ['sv01'] },
  { id: 'ci08', name: '门急诊就诊明细查询服务', type: 'API服务', owner: '平台运营中心', env: '生产', dependsOn: ['ci05'], relatedTenants: ['t01'], relatedServices: ['sv03'] },
  { id: 'ci09', name: '医保结算信息查询服务', type: 'API服务', owner: '平台运营中心', env: '生产', dependsOn: ['ci06'], relatedTenants: ['t01'], relatedServices: ['sv04'] },
  { id: 'ci10', name: '医疗资源指标日度文件服务', type: '文件服务', owner: '平台运营中心', env: '生产', dependsOn: ['ci02'], relatedTenants: ['t01', 't03'], relatedServices: ['sv08'] },
  { id: 'ci11', name: '门急诊就诊实时推送服务', type: '实时服务', owner: '平台运营中心', env: '生产', dependsOn: ['ci03'], relatedTenants: ['t03'], relatedServices: ['sv10'] },
  { id: 'ci12', name: '医保基金监管分析平台', type: '应用', owner: '市医疗保障局', env: '生产', dependsOn: ['ci07', 'ci08', 'ci09'], relatedTenants: ['t01'], relatedServices: ['sv01', 'sv03', 'sv04'] },
  { id: 'ci13', name: '三医一张图可视化', type: '应用', owner: '市卫生健康委员会', env: '生产', dependsOn: ['ci07', 'ci10'], relatedTenants: ['t03'], relatedServices: ['sv01', 'sv08'] },
  { id: 'ci14', name: 'SFTP 文件交换节点', type: '数据源', owner: '运维中心', env: '生产', dependsOn: ['ci01'], relatedTenants: ['t01'], relatedServices: ['sv09'] },
  { id: 'ci15', name: '数据服务网关集群', type: '集群', owner: '运维中心', env: '生产', dependsOn: ['ci01'], relatedTenants: ['t01', 't02', 't03', 't04', 't05'], relatedServices: ['sv01', 'sv02', 'sv03', 'sv04', 'sv05', 'sv12'] },
  { id: 'ci16', name: 'Kafka 消息队列集群', type: '集群', owner: '运维中心', env: '生产', dependsOn: ['ci01'], relatedTenants: ['t03', 't04'], relatedServices: ['sv10', 'sv11'] },
  { id: 'ci17', name: '医保结算信息查询服务（测试）', type: 'API服务', owner: '平台运营中心', env: '测试', dependsOn: ['ci02'], relatedTenants: ['t01'], relatedServices: ['sv04'] }
];

/* ==================================================== 业务流程模板 -- */
const WORKFLOWS = [
  {
    id: 'wf01', name: '数据需求申请审批流', bizType: '数据需求单', version: 'v2.3', status: 'ENABLED',
    desc: '用数方提交需求 → 服务台受理 → 资源归属方审批 → 数据资源管理人员复核 → 安全审批（敏感级别 ≥ L3 时触发）→ 生效',
    nodes: [
      { key: 'n1', name: '提交申请', role: '用数方', slaHours: 0, actions: ['提交', '暂存'] },
      { key: 'n2', name: '服务台受理', role: '服务台受理员', slaHours: 4, actions: ['受理', '退回补充'] },
      { key: 'n3', name: '资源归属方审批', role: '供数方', slaHours: 24, actions: ['通过', '驳回', '加签'] },
      { key: 'n4', name: '资源管理人员复核', role: '数据资源管理人员', slaHours: 24, actions: ['通过', '驳回'] },
      { key: 'n5', name: '安全合规审批', role: '多级安全审批人', slaHours: 48, actions: ['通过', '驳回'], condition: '资源敏感级别 ≥ L3' },
      { key: 'n6', name: '派发实施', role: '生产实施方', slaHours: 72, actions: ['生成任务', '关联任务'] }
    ],
    rules: [
      { level: 1, approvers: ['供数方'], mode: '或签', condition: '全部需求单' },
      { level: 2, approvers: ['数据资源管理人员'], mode: '或签', condition: '新增资产需求' },
      { level: 3, approvers: ['多级安全审批人'], mode: '会签', condition: '资源敏感级别 ≥ L3' }
    ],
    deployArtifacts: null
  },
  {
    id: 'wf02', name: '数据服务变更审批流', bizType: '需求变更单', version: 'v1.8', status: 'ENABLED',
    desc: '变更发起 → 风险评估 → 冲突分析 → 变更审批人审批 → 实施 → 向授权用户同步更新',
    nodes: [
      { key: 'n1', name: '变更发起', role: '用数方', slaHours: 0, actions: ['提交', '撤回'] },
      { key: 'n2', name: '风险评估', role: '生产实施方', slaHours: 8, actions: ['生成评估', '提交'] },
      { key: 'n3', name: '冲突分析', role: '运维工程师', slaHours: 8, actions: ['分析', '确认'] },
      { key: 'n4', name: '变更审批', role: '变更审批人', slaHours: 24, actions: ['通过', '驳回'] },
      { key: 'n5', name: '变更实施', role: '生产实施方', slaHours: 48, actions: ['实施完成'] }
    ],
    rules: [
      { level: 1, approvers: ['变更审批人'], mode: '或签', condition: '风险等级为低 / 中' },
      { level: 2, approvers: ['变更审批人', '多级安全审批人'], mode: '会签', condition: '风险等级为高 或 涉及 L4 资源' }
    ]
  },
  {
    id: 'wf03', name: '资源订阅与交付审批流', bizType: '订阅单', version: 'v1.5', status: 'ENABLED',
    desc: '订阅申请（含需求工单号）→ 资源归属方审批 → 渠道授权 → 密钥发放 → 按需推送',
    nodes: [
      { key: 'n1', name: '订阅申请', role: '用数方', slaHours: 0, actions: ['提交'] },
      { key: 'n2', name: '资源归属方审批', role: '供数方', slaHours: 24, actions: ['通过', '驳回'] },
      { key: 'n3', name: '渠道授权配置', role: '平台管理员', slaHours: 8, actions: ['配置', '保存'] },
      { key: 'n4', name: '密钥发放', role: '平台管理员', slaHours: 4, actions: ['发放', '补发'] }
    ],
    rules: [{ level: 1, approvers: ['供数方'], mode: '或签', condition: '全部订阅单' }]
  },
  {
    id: 'wf04', name: '服务上下线审批流', bizType: '数据服务', version: 'v2.0', status: 'ENABLED',
    desc: '服务发布 / 下线申请 → 多级审批 → 自动推送审批工单 → 执行上下线',
    nodes: [
      { key: 'n1', name: '发布/下线申请', role: '数据资源生产者', slaHours: 0, actions: ['提交'] },
      { key: 'n2', name: '资源管理人员审批', role: '数据资源管理人员', slaHours: 24, actions: ['通过', '驳回', '批量审批'] },
      { key: 'n3', name: '执行上下线', role: '平台管理员', slaHours: 8, actions: ['执行'] }
    ],
    rules: [{ level: 1, approvers: ['数据资源管理人员'], mode: '或签', condition: '全部服务' }]
  },
  {
    id: 'wf05', name: '发布审批流', bizType: '发布单', version: 'v1.2', status: 'ENABLED',
    desc: '发布申请 → 测试情况确认 → 发布审批 → 按批复时间点升级 → 业务验证 → 发布审计',
    nodes: [
      { key: 'n1', name: '发布申请', role: '发布管理员', slaHours: 0, actions: ['提交'] },
      { key: 'n2', name: '测试情况确认', role: '运维工程师', slaHours: 8, actions: ['确认'] },
      { key: 'n3', name: '发布审批', role: '变更审批人', slaHours: 24, actions: ['批复', '驳回'] },
      { key: 'n4', name: '执行升级', role: '发布管理员', slaHours: 0, actions: ['执行'] },
      { key: 'n5', name: '业务验证', role: '运维工程师', slaHours: 4, actions: ['验证通过', '回滚'] }
    ],
    rules: [{ level: 1, approvers: ['变更审批人'], mode: '或签', condition: '全部发布单' }]
  },
  {
    id: 'wf06', name: '事件升级与派发规则', bizType: '事件单', version: 'v1.9', status: 'ENABLED',
    desc: '按严重等级 / 影响程度 / 紧急程度自动计算优先级并按分类自动分派；超时自动升级',
    nodes: [
      { key: 'n1', name: '事件录入', role: '服务台受理员 / 客户自助', slaHours: 0, actions: ['提交'] },
      { key: 'n2', name: '自动分派', role: '系统规则', slaHours: 1, actions: ['自动分派', '手工分派'] },
      { key: 'n3', name: '一线处理', role: '一线运维', slaHours: 4, actions: ['解决', '升级'] },
      { key: 'n4', name: '二线处理', role: '二线 / 专家组', slaHours: 8, actions: ['解决', '转问题'] }
    ],
    rules: []
  }
];

/* ==================================================== 需求申请模板 -- */
const DEMAND_TEMPLATES = [
  {
    id: 'tpl01', name: '跨部门数据共享申请（标准模板）', category: '数据共享',
    desc: '适用于三医部门之间常规数据共享申请，已标准化填写用途、期限与使用方式',
    preset: { kind: 'EXISTING', deliveryForm: 'API', priority: 'P2', updateFreq: '每日增量', usePeriod: '12 个月', desensitize: true, scene: '用于本部门业务监测与统计分析，不向第三方转供。' }
  },
  {
    id: 'tpl02', name: '监管执法数据调取申请', category: '监管执法',
    desc: '适用于监管执法场景的数据调取，需附执法依据文件，审批链自动增加安全审批节点',
    preset: { kind: 'EXISTING', deliveryForm: 'TABLE', priority: 'P1', updateFreq: '实时', usePeriod: '6 个月', desensitize: false, scene: '依据监管执法需要调取相关数据，使用范围限定于本次执法事项。' }
  },
  {
    id: 'tpl03', name: '新增数据采集 / 加工需求', category: '新增资产',
    desc: '适用于主题库尚未覆盖的数据需求，提交后关联采集、加工、建模任务派发',
    preset: { kind: 'NEW', deliveryForm: 'TABLE', priority: 'P1', updateFreq: '每月', usePeriod: '长期', desensitize: true, scene: '现有主题库未覆盖，需新增采集与加工形成数据资源。' }
  },
  {
    id: 'tpl04', name: '科研课题数据使用申请', category: '科研',
    desc: '适用于科研课题使用三医数据，须在数据沙箱内使用，原始明细数据不出沙箱',
    preset: { kind: 'EXISTING', deliveryForm: 'FILE', priority: 'P2', updateFreq: '一次性', usePeriod: '课题周期内', desensitize: true, scene: '用于科研课题研究，在数据沙箱内使用，成果仅输出统计结果。' }
  }
];

/* ============================================== 预定义需求类别（自助服务）-- */
const CATALOG_ITEMS = [
  {
    id: 'sc01', name: '数据资源申请', category: '数据服务', icon: 'DataAnalysis', banner: '',
    desc: '申请使用资源目录中已上架的数据资源（库表 / 接口 / 文件）',
    availability: '99.9%', serviceTime: '7×24 小时', flowId: 'wf01',
    allowedRoles: ['consumer', 'supplier', 'desk', 'ops', 'producer', 'admin'],
    formSchema: [
      { key: 'resource', label: '目标资源', type: 'search', required: true },
      { key: 'deliveryForm', label: '交付方式', type: 'select', required: true, options: ['接口', '库表', '文件下载'] },
      { key: 'usePeriod', label: '使用期限', type: 'text', required: true },
      { key: 'scene', label: '业务场景与用途', type: 'textarea', required: true }
    ]
  },
  {
    id: 'sc02', name: '新增数据需求', category: '数据服务', icon: 'CirclePlus', banner: 'alt',
    desc: '现有资源无法满足时，提出新增数据采集 / 加工 / 建模需求',
    availability: '99.5%', serviceTime: '工作日 09:00-18:00', flowId: 'wf01',
    allowedRoles: ['consumer', 'supplier', 'desk', 'admin'],
    formSchema: [
      { key: 'dataDesc', label: '所需数据描述', type: 'textarea', required: true },
      { key: 'sourceOrg', label: '建议数据来源单位', type: 'text', required: false },
      { key: 'expectAt', label: '期望交付时间', type: 'date', required: true }
    ]
  },
  {
    id: 'sc03', name: '数据服务订阅', category: '数据服务', icon: 'Connection', banner: 'purple',
    desc: '订阅已发布的 API 服务 / 文件服务 / 实时服务（需填写需求工单号）',
    availability: '99.9%', serviceTime: '7×24 小时', flowId: 'wf03',
    allowedRoles: ['consumer', 'supplier', 'desk', 'admin'],
    formSchema: [
      { key: 'demandNo', label: '需求工单号', type: 'text', required: true },
      { key: 'service', label: '目标服务', type: 'search', required: true },
      { key: 'app', label: '绑定应用', type: 'search', required: true },
      { key: 'estCalls', label: '预估调用量(次/月)', type: 'number', required: true }
    ]
  },
  {
    id: 'sc04', name: '数据质量问题反馈', category: '故障申诉', icon: 'Warning', banner: 'warm',
    desc: '反馈数据缺失、口径错误、更新延迟等数据质量问题',
    availability: '99.5%', serviceTime: '7×24 小时', flowId: 'wf06',
    allowedRoles: ['consumer', 'supplier', 'desk', 'ops', 'producer', 'admin'],
    formSchema: [
      { key: 'resource', label: '涉及资源', type: 'search', required: true },
      { key: 'problemType', label: '问题类型', type: 'select', required: true, options: ['数据缺失', '口径不一致', '更新延迟', '数据错误', '接口异常'] },
      { key: 'desc', label: '问题描述', type: 'textarea', required: true }
    ]
  },
  {
    id: 'sc05', name: '系统故障报修', category: '故障申诉', icon: 'Tools',
    desc: '平台功能不可用、接口报错、性能异常等故障申报',
    availability: '99.9%', serviceTime: '7×24 小时', flowId: 'wf06',
    allowedRoles: ['consumer', 'supplier', 'desk', 'ops', 'producer', 'admin'],
    formSchema: [
      { key: 'system', label: '故障系统/功能', type: 'text', required: true },
      { key: 'severity', label: '影响程度', type: 'select', required: true, options: ['严重影响业务', '部分功能受影响', '轻微影响'] },
      { key: 'desc', label: '故障现象', type: 'textarea', required: true }
    ]
  },
  {
    id: 'sc06', name: '权限与账号申请', category: '权限服务', icon: 'Key', banner: 'alt',
    desc: '申请平台账号、角色权限、密钥补发等',
    availability: '99.5%', serviceTime: '工作日 09:00-18:00', flowId: 'wf03',
    allowedRoles: ['consumer', 'supplier', 'desk', 'ops', 'producer', 'admin'],
    formSchema: [
      { key: 'accountType', label: '申请类型', type: 'select', required: true, options: ['新建账号', '权限调整', '密钥补发', '租户注册'] },
      { key: 'targetUser', label: '目标人员', type: 'text', required: true },
      { key: 'reason', label: '申请理由', type: 'textarea', required: true }
    ]
  }
];

/* ============================================ 事件分类 / 模板 / 决策树 -- */
const INCIDENT_CATEGORIES = [
  { id: 'ic01', name: '数据服务接口异常', group: '数据服务', autoAssign: '运维中心 · 二线支持组', keywords: ['接口', 'API', '报错', '超时', '502', '鉴权'] },
  { id: 'ic02', name: '数据更新延迟', group: '数据质量', autoAssign: '数据生产中心 · 加工组', keywords: ['延迟', '未更新', 'T+1', '调度'] },
  { id: 'ic03', name: '数据缺失 / 不一致', group: '数据质量', autoAssign: '数据生产中心 · 加工组', keywords: ['缺失', '为空', '不一致', '对不上'] },
  { id: 'ic04', name: '平台功能不可用', group: '平台功能', autoAssign: '运维中心 · 一线支持组', keywords: ['打不开', '白屏', '无法登录', '崩溃'] },
  { id: 'ic05', name: '性能问题', group: '平台功能', autoAssign: '运维中心 · 二线支持组', keywords: ['慢', '卡', '性能', '响应时间长'] },
  { id: 'ic06', name: '权限与账号问题', group: '安全与权限', autoAssign: '平台运营中心', keywords: ['权限', '账号', '登录失败', '密钥'] },
  { id: 'ic07', name: '数据安全事件', group: '安全与权限', autoAssign: '安全与合规管理处', keywords: ['泄露', '越权', '脱敏', '水印'] }
];

const INCIDENT_TEMPLATES = [
  { id: 'it01', name: 'API 接口调用失败', categoryId: 'ic01', severity: '高', impact: '部分功能受影响', urgency: '紧急', title: '【接口异常】xxx 服务调用返回异常', desc: '服务名称：\n调用时间：\n错误码：\n请求参数：\n期望结果：' },
  { id: 'it02', name: '数据未按时更新', categoryId: 'ic02', severity: '中', impact: '部分功能受影响', urgency: '较急', title: '【数据延迟】xxx 资源未按时更新', desc: '资源名称：\n预期更新时间：\n实际状态：\n影响范围：' },
  { id: 'it03', name: '平台无法登录', categoryId: 'ic04', severity: '严重', impact: '严重影响业务', urgency: '紧急', title: '【平台故障】无法登录数据服务管理工具', desc: '发生时间：\n操作步骤：\n报错信息：\n已尝试的处理：' },
  { id: 'it04', name: '数据与报表口径不一致', categoryId: 'ic03', severity: '中', impact: '轻微影响', urgency: '一般', title: '【口径不一致】xxx 指标与业务系统不一致', desc: '指标名称：\n统计区间：\n平台值：\n业务系统值：' }
];

/* 事件决策树（原文：提供事件决策树功能帮助处理人员进行事件分析） */
const DECISION_TREE = {
  root: 'q1',
  nodes: {
    q1: { type: 'q', text: '用户是否能够正常登录平台？', options: [{ label: '无法登录', next: 'r_login' }, { label: '可以登录，功能异常', next: 'q2' }] },
    q2: { type: 'q', text: '异常发生在数据服务调用还是平台页面操作？', options: [{ label: '数据服务调用（API/文件/实时）', next: 'q3' }, { label: '平台页面操作', next: 'r_page' }] },
    q3: { type: 'q', text: '接口返回的错误类型是？', options: [{ label: '鉴权失败 / 401 / 403', next: 'r_auth' }, { label: '超时 / 504', next: 'r_timeout' }, { label: '数据为空或结果异常', next: 'r_data' }] },
    r_login: { type: 'r', text: '判定为「平台访问层故障」', advice: '建议：① 检查统一认证服务与网关状态；② 确认账号是否被禁用或权限变更；③ 若为租户级故障，按 P1 升级至运维中心二线。建议关联知识条目《平台无法登录排查指引》。', tags: ['平台功能不可用', '权限与账号问题'] },
    r_page: { type: 'r', text: '判定为「平台功能异常」', advice: '建议：① 收集浏览器控制台报错与操作路径；② 检查前端资源版本与最近发布记录；③ 若与最近发布相关，触发发布回滚评估。建议关联知识条目《前端功能异常定位方法》。', tags: ['平台功能不可用'] },
    r_auth: { type: 'r', text: '判定为「接口鉴权问题」', advice: '建议：① 核对应用密钥是否过期或已更换；② 确认服务渠道授权范围是否包含该应用；③ 检查 IP 白名单配置。建议关联知识条目《API 鉴权失败排查清单》。', tags: ['数据服务接口异常', '权限与账号问题'] },
    r_timeout: { type: 'r', text: '判定为「性能或资源瓶颈」', advice: '建议：① 查看服务调用明细与慢 SQL 排行；② 检查集群资源使用率与任务并发；③ 必要时申请资源扩容或错峰调度。建议关联知识条目《接口超时性能排查路径》。', tags: ['性能问题', '数据服务接口异常'] },
    r_data: { type: 'r', text: '判定为「数据质量问题」', advice: '建议：① 核对作业调度执行记录与上游数据批次；② 检查稽核规则告警；③ 若为数据错误，转入问题单做根因分析。建议关联知识条目《数据缺失与口径不一致处理规范》。', tags: ['数据缺失 / 不一致', '数据更新延迟'] }
  }
};

/* ================================================== 知识库分类与条目 -- */
/* 分类树只承载"按产品 / 用户群 / 业务领域 / 地点"的维度划分；
   维护责任人是知识条目（KNOWLEDGES.owner）的属性，分类节点不带责任人。 */
const KB_CATEGORIES = [
  {
    id: 'kc01', name: '数据服务管理工具', dim: '产品', children: [
      { id: 'kc011', name: '数据需求管理', dim: '产品', children: [] },
      { id: 'kc012', name: '资源目录与订阅', dim: '产品', children: [] },
      { id: 'kc013', name: '能力开放门户', dim: '产品', children: [] }
    ]
  },
  {
    id: 'kc02', name: '数据质量与生产', dim: '业务领域', children: [
      { id: 'kc021', name: '数据采集与接入', dim: '业务领域', children: [] },
      { id: 'kc022', name: '数据加工与调度', dim: '业务领域', children: [] }
    ]
  },
  {
    id: 'kc03', name: '安全与合规', dim: '业务领域', children: [
      { id: 'kc031', name: '数据分类分级', dim: '业务领域', children: [] },
      { id: 'kc032', name: '脱敏与授权', dim: '业务领域', children: [] }
    ]
  },
  {
    id: 'kc04', name: '三医部门用户', dim: '用户群', children: [
      { id: 'kc041', name: '市医保局', dim: '用户群', children: [] },
      { id: 'kc042', name: '市药监局', dim: '用户群', children: [] }
    ]
  },
  {
    id: 'kc05', name: '市级数据中心', dim: '地点', children: []
  }
];

const KNOWLEDGES = [
  {
    id: 'k01', no: 'ZS2026010001', title: 'API 服务鉴权失败（401/403）排查清单', categoryId: 'kc011', categoryName: '数据需求管理',
    owner: '陈志刚', status: 'PUBLISHED', createdAt: D(-180, 9, 0), publishedAt: D(-178, 10, 0), refCount: 86,
    contentText: '鉴权失败 密钥过期 渠道授权 IP白名单 appKey appSecret 401 403 排查',
    contentHtml: '<h3>适用场景</h3><p>数据服务订阅方调用 API 服务时返回 <code>401 Unauthorized</code> 或 <code>403 Forbidden</code>。</p>' +
      '<h3>排查步骤</h3><ol><li>核对应用密钥：登录平台 → 服务订阅 → 密钥管理，确认 <code>appKey / appSecret</code> 是否为最新版本。若近期执行过「更换密钥」，需同步更新调用方配置。</li>' +
      '<li>确认渠道授权范围：在「服务渠道授权管理」中检查该服务的使用范围与可见范围是否包含调用方应用。</li>' +
      '<li>检查 IP 白名单：文件服务与部分 API 服务配置了白名单，确认调用来源 IP 在名单内。</li>' +
      '<li>确认服务状态：服务若处于「已停用 / 已下线」，会返回 403，需联系服务发布方确认。</li></ol>' +
      '<h3>升级路径</h3><blockquote>上述步骤均无法解决时，按 P1 升级至运维中心二线支持组，并附上完整请求与响应报文。</blockquote>',
    attachments: [{ name: 'API鉴权失败排查清单.pdf', type: 'pdf', size: '486 KB', contentText: '鉴权失败排查 密钥 渠道授权 白名单 常见错误码对照表 401 403 504' }],
    ratings: [{ user: '李慧敏', score: 5, at: D(-120, 14, 0) }, { user: '吴强', score: 5, at: D(-96, 11, 0) }, { user: '郑晓', score: 4, at: D(-40, 16, 0) }],
    comments: [{ user: '李慧敏', content: '按这个清单排查，5 分钟就定位到是密钥更换后未同步，很实用。', at: D(-120, 14, 0), ownerNotified: true }],
    relatedIds: ['k04']
  },
  {
    id: 'k02', no: 'ZS2026010002', title: '数据更新延迟（T+1 未到数）处理规范', categoryId: 'kc022', categoryName: '数据加工与调度',
    owner: '刘涛', status: 'PUBLISHED', createdAt: D(-165, 10, 0), publishedAt: D(-163, 9, 0), refCount: 124,
    contentText: '数据延迟 未更新 调度 作业 T+1 补数 稽核',
    contentHtml: '<h3>现象</h3><p>订阅方反馈 T+1 数据未按时更新，或文件服务下发的文件日期滞后。</p>' +
      '<h3>处理步骤</h3><ol><li>在「数据生产大屏」查看加工进度指标与任务加工进度，确认作业是否卡在某个环节。</li>' +
      '<li>检查作业依赖：上游采集任务是否完成、上游数据批次是否到位。</li>' +
      '<li>查看稽核结果：若稽核规则告警，优先处理稽核错误并触发问题工单。</li>' +
      '<li>确认后执行补数：在「推送任务管理」中使用补推任务功能，对已发生错误的推送任务进行补救。</li>' +
      '<li>向订阅方同步更新进展，并在事件单记录处理过程。</li></ol>' +
      '<h3>时效要求</h3><p>按运维支撑考核指标，数据延迟类事件应在 4 小时内给出初步结论。</p>',
    attachments: [{ name: '数据延迟处理流程.docx', type: 'word', size: '1.2 MB', contentText: '数据延迟 处理流程 补数 稽核 调度依赖 时效要求' }],
    ratings: [{ user: '郑晓', score: 5, at: D(-100, 9, 0) }, { user: '朱琳', score: 5, at: D(-60, 15, 0) }],
    comments: [{ user: '朱琳', content: '区平台上报延迟时按这个流程处理，补推很顺利。', at: D(-60, 15, 0), ownerNotified: true }],
    relatedIds: []
  },
  {
    id: 'k03', no: 'ZS2026010003', title: '数据需求申请填写指引（含字段说明）', categoryId: 'kc011', categoryName: '数据需求管理',
    owner: '王思远', status: 'PUBLISHED', createdAt: D(-150, 11, 0), publishedAt: D(-148, 14, 0), refCount: 208,
    contentText: '需求申请 填写指引 字段说明 用途 使用期限 交付方式 模板',
    contentHtml: '<h3>申请前准备</h3><ul><li>明确业务场景与用途，用途描述将作为审批的重要依据。</li>' +
      '<li>确认所需数据项清单与时间范围，避免申请范围过大导致审批周期延长。</li>' +
      '<li>判断属于「已有资产」还是「新增资产」：资源目录中可检索到的属已有资产；检索不到的按新增资产提出。</li></ul>' +
      '<h3>关键字段说明</h3><p><b>交付方式</b>：接口类型将提供接口文档；库表类型提供库表名称等访问途径；文件类型提供下载操作。</p>' +
      '<p><b>使用期限</b>：建议按实际需要填写，到期后系统自动提醒续期，避免长期占用授权。</p>' +
      '<p><b>脱敏要求</b>：涉及敏感级别 L3 及以上的资源，默认按分类分级结果脱敏后交付。</p>' +
      '<h3>常见退回原因</h3><ol><li>用途描述过于笼统（如仅填写"业务需要"）。</li><li>申请范围超出业务必要范围。</li><li>未填写使用期限或期限明显不合理。</li></ol>',
    attachments: [{ name: '数据需求申请模板.xlsx', type: 'xlsx', size: '86 KB', contentText: '需求申请 模板 字段说明 用途 期限 交付方式' }],
    ratings: [{ user: '李慧敏', score: 4, at: D(-110, 10, 0) }, { user: '黄伟', score: 5, at: D(-30, 13, 0) }],
    comments: [], relatedIds: ['k01']
  },
  {
    id: 'k04', no: 'ZS2026010004', title: '服务渠道授权与密钥管理操作手册', categoryId: 'kc012', categoryName: '资源目录与订阅',
    owner: '赵敏', status: 'PUBLISHED', createdAt: D(-140, 9, 0), publishedAt: D(-138, 16, 0), refCount: 64,
    contentText: '渠道授权 密钥 补发 更换 使用范围 可见范围 应用绑定',
    contentHtml: '<h3>渠道授权配置</h3><p>在「服务渠道授权管理」中基于服务发布渠道配置使用范围与可见范围：使用范围决定哪些用户或组织可以使用该服务；可见范围决定哪些用户能在系统中看到该服务。</p>' +
      '<h3>密钥管理</h3><ol><li>查看租户发布的所有服务列表与订阅数，可查看申请人与申请应用。</li>' +
      '<li>为选定服务的订购方补发密钥，或为所有订购方更换密钥。</li>' +
      '<li>更换密钥后需通知全部订购方同步更新，操作记录可在密钥管理中查看。</li></ol>' +
      '<blockquote>注意：更换密钥属于对已授权用户的服务变更，需按变更管理流程同步更新至其授权用户。</blockquote>',
    attachments: [], ratings: [{ user: '张建国', score: 4, at: D(-90, 11, 0) }], comments: [], relatedIds: ['k01']
  },
  {
    id: 'k05', no: 'ZS2026010005', title: '敏感数据脱敏规则与 SM4 加密说明', categoryId: 'kc032', categoryName: '脱敏与授权',
    owner: '周雅静', status: 'PUBLISHED', createdAt: D(-130, 14, 0), publishedAt: D(-128, 9, 0), refCount: 47,
    contentText: '脱敏 SM3 SM4 加密 掩码 截断 分级 L3 L4 安全级别 算法',
    contentHtml: '<h3>脱敏算法</h3><p>平台提供不少于 5 个安全级别、20 种以上脱敏算法，涵盖加密、掩码、哈希、截断等方式，其中必须支持国产 SM3 与 SM4 算法，并支持算法参数配置与效果测试。</p>' +
      '<h3>按级别的默认处理</h3><ul><li><b>L1 公开</b>：不脱敏。</li><li><b>L2 内部</b>：联系方式等字段掩码。</li><li><b>L3 敏感</b>：身份证号、手机号、就诊标识掩码；明细数据需授权后使用。</li><li><b>L4 高敏感</b>：采用 SM4 加密，原始明细数据不出数据沙箱。</li></ul>' +
      '<h3>前端展示规则</h3><p>资源字段级的脱敏、分类分级属性对接公安部相关要求，并按照配置规则在前端页面脱敏后展示。</p>',
    attachments: [{ name: '脱敏算法对照表.pptx', type: 'ppt', size: '2.4 MB', contentText: '脱敏算法 SM3 SM4 掩码 截断 哈希 加密 安全级别 效果测试' }],
    ratings: [{ user: '陈志刚', score: 5, at: D(-70, 10, 0) }], comments: [], relatedIds: []
  },
  {
    id: 'k06', no: 'ZS2026010006', title: '数据沙箱使用规范（原始明细不出沙箱）', categoryId: 'kc031', categoryName: '数据分类分级',
    owner: '周雅静', status: 'PUBLISHED', createdAt: D(-120, 10, 0), publishedAt: D(-118, 15, 0), refCount: 33,
    contentText: '沙箱 可用不可见 训练沙箱 准生产沙箱 高敏感 原始明细 不出门',
    contentHtml: '<h3>适用范围</h3><p>高敏感数据的开发利用必须使用训练沙箱构建模型、数据沙箱生产运行、生产沙箱结果数据整合输出，原始明细数据不出数据沙箱。</p>' +
      '<h3>沙箱类型</h3><ul><li><b>训练沙箱</b>：数据样本接入，专业机器学习模型训练组件。</li><li><b>准生产沙箱</b>：真实脱敏数据接入，运行输出结果数据。</li><li><b>生产沙箱</b>：结果数据整合输出，通过租户空间封装成服务输出。</li></ul>' +
      '<h3>权限与审计</h3><p>沙箱支持以用户/用户组、结构化与非结构化数据资源为核心要素设置多对多访问控制策略，并基于最小权限原则从表级、行级、字段级管控；所有数据操作全生命周期日志记录，实现可追溯、可审计、可定责。</p>',
    attachments: [], ratings: [{ user: '郑晓', score: 4, at: D(-45, 14, 0) }], comments: [], relatedIds: ['k05']
  },
  {
    id: 'k07', no: 'ZS2026010007', title: '平台无法登录排查指引', categoryId: 'kc011', categoryName: '数据需求管理',
    owner: '徐鹏', status: 'PUBLISHED', createdAt: D(-110, 9, 0), publishedAt: D(-108, 11, 0), refCount: 152,
    contentText: '无法登录 白屏 账号 权限 密码 浏览器 缓存 统一认证',
    contentHtml: '<h3>排查顺序</h3><ol><li>确认网络与域名可访问，排除本地网络问题。</li>' +
      '<li>确认账号状态：是否被禁用、是否在有效期内。</li>' +
      '<li>尝试无痕窗口访问，排除浏览器缓存问题。</li>' +
      '<li>确认统一认证服务状态，若多用户同时无法登录则为平台级故障。</li>' +
      '<li>检查最近发布记录，若与发布时间吻合，按发布回滚流程处理。</li></ol>' +
      '<h3>记录要求</h3><p>处理过程需在事件单中完整记录，关闭时选择对应关闭方式（一线解决 / 二线解决 / 用户确认关闭）。</p>',
    attachments: [{ name: '登录故障排查.txt', type: 'txt', size: '12 KB', contentText: '无法登录 排查 统一认证 缓存 账号状态 平台级故障 回滚' }],
    ratings: [{ user: '李慧敏', score: 5, at: D(-80, 9, 0) }, { user: '朱琳', score: 4, at: D(-52, 10, 0) }, { user: '马超', score: 5, at: D(-20, 16, 0) }],
    comments: [{ user: '马超', content: '医院侧同事反馈的问题按这个流程自查后基本都是浏览器缓存。', at: D(-20, 16, 0), ownerNotified: true }],
    relatedIds: []
  },
  {
    id: 'k08', no: 'ZS2026010008', title: '数据缺失与口径不一致处理规范', categoryId: 'kc022', categoryName: '数据加工与调度',
    owner: '何静', status: 'PUBLISHED', createdAt: D(-100, 15, 0), publishedAt: D(-98, 10, 0), refCount: 71,
    contentText: '数据缺失 口径不一致 稽核 对账 指标 统计口径',
    contentHtml: '<h3>两类问题的区分</h3><p><b>数据缺失</b>：应为有值却为空，通常源于采集失败、字段映射错误或过滤条件不当。</p>' +
      '<p><b>口径不一致</b>：平台值与业务系统值存在系统性差异，通常源于统计周期、人群范围、退费处理等口径定义差异。</p>' +
      '<h3>处理规范</h3><ol><li>要求反馈方提供具体的资源名称、统计区间、对比口径与差异样例。</li>' +
      '<li>核对稽核规则与稽核结果，确认是否存在规则未覆盖的情况。</li>' +
      '<li>口径问题需形成书面口径说明并更新至知识库，避免重复咨询。</li>' +
      '<li>确属数据错误且无法即时修复的，转入问题单做根因分析并给出临时解决方案。</li></ol>',
    attachments: [], ratings: [{ user: '吴强', score: 4, at: D(-40, 11, 0) }], comments: [], relatedIds: ['k02']
  },
  {
    id: 'k09', no: 'ZS2026010009', title: '需求变更的风险评估与冲突分析要点', categoryId: 'kc011', categoryName: '数据需求管理',
    owner: '孙立', status: 'PENDING_REVIEW', createdAt: D(-12, 10, 0), refCount: 0,
    contentText: '需求变更 风险评估 冲突分析 影响模拟 CMDB 配置项 服务调用',
    contentHtml: '<h3>风险评估（基于 CMDB 影响模拟）</h3><p>输入变更对象后，系统基于配置管理数据库的数据模型进行影响模拟分析，输出受影响的配置项、服务、订阅方与影响等级。</p>' +
      '<h3>冲突分析</h3><p>基于配置项与服务调用情况进行变更冲突分析，主要识别三类冲突：时间窗冲突（同一窗口内的多个变更）、资源冲突（同一配置项被多个变更占用）、服务依赖冲突（变更影响链上存在其他在途变更）。</p>' +
      '<h3>可视化变更窗口</h3><p>制定变更计划时应参考可视化变更窗口，窗口中同时展示当前已有变更与业务事件日程，避免与业务高峰冲突。</p>',
    attachments: [], ratings: [], comments: [], relatedIds: []
  },
  {
    id: 'k10', no: 'ZS2026010010', title: '资源目录检索技巧（业务导航 + 全文检索）', categoryId: 'kc012', categoryName: '资源目录与订阅',
    owner: '张建国', status: 'PUBLISHED', createdAt: D(-90, 9, 0), publishedAt: D(-88, 14, 0), refCount: 96,
    contentText: '资源目录 检索 业务导航 精确检索 模糊检索 筛选 主题域 模型层',
    contentHtml: '<h3>检索方式</h3><ul><li><b>业务导航检索</b>：按三医业务类重要指标导航统计，如资源类型、来源分类、数据分类，支持目录树结构化导航。</li>' +
      '<li><b>全文检索</b>：结合业务导航，对资源详情页做关键字/词全文检索。</li>' +
      '<li><b>精准与模糊检索区分展示</b>：按表名称、表注释进行全局精准与模糊搜索，搜索结果页可按数据类型、标签、工作空间、数据源、模型层、主题域、创建人过滤。</li></ul>' +
      '<h3>排序维度</h3><p>支持按资源名称、上架时间、浏览量、订阅量、资源星级排序，便于快速发现高质量资源。</p>',
    attachments: [], ratings: [{ user: '黄伟', score: 5, at: D(-35, 9, 0) }], comments: [], relatedIds: ['k03']
  },
  {
    id: 'k11', no: 'ZS2026010011', title: '事件分级标准与优先级矩阵', categoryId: 'kc011', categoryName: '数据需求管理',
    owner: '王思远', status: 'PUBLISHED', createdAt: D(-80, 11, 0), publishedAt: D(-78, 9, 0), refCount: 58,
    contentText: '事件分级 严重等级 影响程度 紧急程度 优先级矩阵 响应时限',
    contentHtml: '<h3>三个分类维度</h3><p>事件按<b>严重等级</b>（严重 / 高 / 中 / 低）、<b>影响程度</b>（严重影响业务 / 部分功能受影响 / 轻微影响）、<b>紧急程度</b>（紧急 / 较急 / 一般）三个维度分类，并据此计算优先级。</p>' +
      '<h3>优先级矩阵</h3><p>影响程度 × 紧急程度 → 优先级：严重影响业务 + 紧急 = P0；部分受影响 + 紧急 或 严重影响 + 较急 = P1；其余组合按影响程度依次递减为 P2 / P3。</p>' +
      '<h3>响应时限</h3><p>P0：30 分钟响应；P1：2 小时；P2：8 小时；P3：24 小时。</p>' +
      '<blockquote>说明：以上时限为现行运维管理办法的执行口径，如遇调整以最新办法为准。</blockquote>',
    attachments: [], ratings: [{ user: '陈志刚', score: 4, at: D(-30, 10, 0) }], comments: [], relatedIds: ['k07']
  },
  {
    id: 'k12', no: 'ZS2026010012', title: '租户注册与企业资质审核要点', categoryId: 'kc013', categoryName: '能力开放门户',
    owner: '赵敏', status: 'PUBLISHED', createdAt: D(-70, 14, 0), publishedAt: D(-68, 10, 0), refCount: 29,
    contentText: '租户注册 个人 企业 资质 营业编码 审核 不通过 重新提交',
    contentHtml: '<h3>个人账号注册</h3><p>需填写姓名、手机号、身份证、邮箱、用户名、密码等信息后提交。</p>' +
      '<h3>企业账号注册</h3><p>需填写公司类型、租户性质、公司名称、营业编码、所属区域、详细地址、职位，并上传公司文件。</p>' +
      '<h3>审核要点</h3><ol><li>核对营业编码与公司名称是否一致。</li><li>确认申请的能力类型与业务场景匹配。</li><li>审核不通过时需说明原因，租户需重新提交注册信息；审核通过后用户方可使用注册用户名登录。</li></ol>',
    attachments: [], ratings: [], comments: [], relatedIds: []
  },
  {
    id: 'k13', no: 'ZS2026010013', title: '三医主数据标准与贯标要求', categoryId: 'kc021', categoryName: '数据采集与接入',
    owner: '张建国', status: 'PUBLISHED', createdAt: D(-60, 9, 0), publishedAt: D(-58, 15, 0), refCount: 42,
    contentText: '主数据 标准 贯标 唯一 准确 一致 编码 字典',
    contentHtml: '<h3>主数据范围</h3><p>将三医部门中跨部门、跨层级、跨系统、跨业务的数据共享和业务协同过程中共性、共享、共用的关键性、持久性的业务实体核心数据定义为三医主数据。</p>' +
      '<h3>管理机制</h3><p>通过建立"一套管理机制、一套标准体系、一个管理工具"为核心，实现主数据的体系化、标准化、系统化管理，使各部门、各系统都可以使用唯一的、准确的、一致的主数据。</p>' +
      '<h3>贯标要求</h3><p>新增采集的数据需按三医主数据标准完成贯标后方可上架资源目录。</p>',
    attachments: [], ratings: [{ user: '何静', score: 5, at: D(-25, 14, 0) }], comments: [], relatedIds: ['k08']
  },
  {
    id: 'k14', no: 'ZS2026010014', title: '发布包归档与版本回滚操作指引', categoryId: 'kc011', categoryName: '数据需求管理',
    owner: '赵敏', status: 'PUBLISHED', createdAt: D(-50, 10, 0), publishedAt: D(-48, 11, 0), refCount: 37,
    contentText: '发布 归档 回滚 版本 撤回 业务验证 停机时间 发布审计',
    contentHtml: '<h3>发布包归档</h3><p>每次发布的安装都进行归档，可随时回滚到上一个版本。归档信息包括版本号、归档时间、操作人与备注。</p>' +
      '<h3>回滚条件</h3><p>升级后发现重大问题时可回滚到上一个版本，排除故障后重新发布。回滚需记录原因、源版本与目标版本。</p>' +
      '<h3>业务验证</h3><p>按批复的发布申请要求，在规定时间点升级，并逐项完成业务验证；验证不通过应触发回滚评估。</p>' +
      '<h3>发布审计</h3><p>对发布项进行事后审计，确保每次升级闭环。</p>',
    attachments: [], ratings: [], comments: [], relatedIds: []
  }
];

/* ======================================================== 知识问答 -- */
const QNAS = [
  {
    id: 'q01', no: 'WD2026010001', question: '文件服务下发的 CSV 文件中文乱码，如何解决？', asker: '朱琳', askerOrg: '区全民健康信息平台（朝阳区）', askedAt: D(-9, 10, 0),
    status: 'ANSWERED',
    answers: [
      { id: 'a1', user: '陈志刚', content: '文件服务默认采用 UTF-8 with BOM 编码。请先确认取数规则中未自行指定编码；若使用 Excel 直接打开，建议通过「数据 → 从文本/CSV」导入并选择 UTF-8。', at: D(-9, 14, 0), clue: '编码 / 乱码 / 文件服务', isBest: false },
      { id: 'a2', user: '刘涛', content: '补充：若在 Linux 环境用脚本处理，请确认 locale 设置；另外分包压缩后的文件需先解压再解析。', at: D(-8, 9, 0), clue: '编码 / 分包压缩 / 解析', isBest: false }
    ]
  },
  {
    id: 'q02', no: 'WD2026010002', question: '需求单被驳回后，是修改原单还是新建一单？', asker: '黄伟', askerOrg: '市应急管理局', askedAt: D(-7, 15, 0),
    status: 'ANSWERED',
    answers: [
      { id: 'a1', user: '王思远', content: '驳回后原单会回到「已驳回」状态并保留完整审批意见。建议直接在原单上修改后重新提交，这样流转记录连续可追溯；仅当需求对象发生实质变化（如改为申请另一类资源）时才新建需求单。', at: D(-7, 16, 0), clue: '驳回 / 重新提交 / 流转记录', isBest: false }
    ]
  },
  {
    id: 'q03', no: 'WD2026010003', question: 'L4 高敏感数据能否直接导出明细用于建模？', asker: '郑晓', askerOrg: '市疾病预防控制中心', askedAt: D(-5, 9, 0),
    status: 'ARCHIVED',
    answers: [
      { id: 'a1', user: '周雅静', content: '不可以。L4 高敏感数据必须使用数据沙箱：训练沙箱接入数据样本训练模型，准生产沙箱接入真实脱敏数据运行，最终结果数据通过租户空间封装成服务输出，原始明细数据不出数据沙箱。', at: D(-5, 11, 0), clue: '沙箱 / 高敏感 / 原始明细', isBest: true },
      { id: 'a2', user: '陈志刚', content: '补充沙箱申请流程：先由安全审批人完成临时授权工单逐级审批，再开通沙箱空间。', at: D(-5, 13, 0), clue: '沙箱申请 / 临时授权', isBest: false }
    ],
    archivedKnowledgeId: 'k06', archivedAt: D(-4, 10, 0)
  },
  {
    id: 'q04', no: 'WD2026010004', question: '实时服务订阅时填写的需求工单号在哪里获取？', asker: '李慧敏', askerOrg: '市医疗保障局', askedAt: D(-3, 14, 0),
    status: 'ANSWERED',
    answers: [
      { id: 'a1', user: '赵敏', content: '需求工单号即需求单编号（形如 XQ202601xxxxx），在「需求单管理」列表中可直接查看。只有审批通过且状态为「已交付 / 实施中」的需求单才可用于订阅，系统会校验工单号与申请资源的一致性。', at: D(-3, 15, 0), clue: '需求工单号 / 订阅 / 校验', isBest: false }
    ]
  },
  {
    id: 'q05', no: 'WD2026010005', question: '变更窗口中的「业务事件日程」数据来自哪里？', asker: '孙立', askerOrg: '三医联动信息化工作领导小组办公室', askedAt: D(-2, 10, 0),
    status: 'ASKED', answers: []
  },
  {
    id: 'q06', no: 'WD2026010006', question: '邮件提交的需求会自动建单吗？需要多久受理？', asker: '马超', askerOrg: '北京大学第三医院', askedAt: D(-1, 16, 0),
    status: 'ANSWERED',
    answers: [
      { id: 'a1', user: '王思远', content: '服务台邮箱收到的申请会按预定义需求类别自动解析并生成需求单草稿，受理员核对信息后正式受理。现行受理时限为 4 小时。为避免解析失败，建议在邮件主题中标注需求类别。', at: D(-1, 17, 0), clue: '邮件建单 / 需求类别 / 受理时限', isBest: false }
    ]
  }
];

/* ======================================================== 审计种子 -- */
const AUDIT_SEED = [
  { bizType: 'demands', bizId: 'd05', bizNo: 'XQ20260118005', bizTitle: '医保基金监管分析-门急诊费用数据申请', action: '审批通过', operator: '张建国', operatorOrg: '市卫生健康委员会 · 数据资源管理处', operatedAt: D(-6, 10, 0), ip: '10.20.11.42', terminal: 'Web 端 / Chrome', remark: '用途明确，同意共享，按 L3 脱敏后交付', changes: [{ field: 'status', before: '待审批', after: '审批通过' }] },
  { bizType: 'changes', bizId: 'c02', bizNo: 'BG20260120002', bizTitle: '门急诊就诊明细查询服务-字段范围调整', action: '风险评估', operator: '刘涛', operatorOrg: '数据生产中心 · 加工组', operatedAt: D(-4, 15, 0), ip: '10.20.31.18', terminal: 'Web 端 / Chrome', remark: '影响模拟分析完成，影响 2 个配置项、1 个 API 服务、1 个租户', changes: [{ field: 'riskLevel', before: '（空）', after: '中' }] },
  { bizType: 'tasks', bizId: 't03', bizNo: 'RW20260119003', bizTitle: '门急诊就诊明细视图加工', action: '接单', operator: '刘涛', operatorOrg: '数据生产中心 · 加工组', operatedAt: D(-7, 9, 0), ip: '10.20.31.18', terminal: 'Web 端 / Chrome', remark: '', changes: [{ field: 'status', before: '待接单', after: '实施中' }] },
  { bizType: 'incidents', bizId: 'i02', bizNo: 'SJ20260125002', bizTitle: '【数据延迟】门急诊就诊记录未按时更新', action: '升级', operator: '徐鹏', operatorOrg: '运维中心 · 一线支持组', operatedAt: D(-1, 11, 0), ip: '10.20.22.7', terminal: 'Web 端 / Chrome', remark: '一线无法定位，升级至二线支持组', changes: [{ field: 'status', before: '处理中', after: '已升级' }, { field: 'handlerGroup', before: '运维中心 · 一线支持组', after: '运维中心 · 二线支持组' }] },
  { bizType: 'problems', bizId: 'p01', bizNo: 'WT2026010001', bizTitle: '门急诊就诊记录批量延迟（根因：上游采集批次缺失）', action: '转入已知错误', operator: '陈志刚', operatorOrg: '运维中心 · 二线支持组', operatedAt: D(-1, 16, 0), ip: '10.20.22.9', terminal: 'Web 端 / Chrome', remark: '根因已定位，根治方案待上游改造，先提供临时方案', changes: [{ field: 'status', before: '分析中', after: '已知错误' }] },
  { bizType: 'knowledges', bizId: 'k09', bizNo: 'ZS2026010009', bizTitle: '需求变更的风险评估与冲突分析要点', action: '提交审核', operator: '孙立', operatorOrg: '三医联动信息化工作领导小组办公室', operatedAt: D(-12, 10, 0), ip: '10.20.9.3', terminal: 'Web 端 / Chrome', remark: '', changes: [{ field: 'status', before: '草稿', after: '待审核' }] },
  { bizType: 'releases', bizId: 'r02', bizNo: 'FB20260122002', bizTitle: '数据服务管理工具 v1.4.2 版本发布', action: '业务验证', operator: '陈志刚', operatorOrg: '运维中心 · 二线支持组', operatedAt: D(-3, 9, 0), ip: '10.20.22.9', terminal: 'Web 端 / Chrome', remark: '8 项验证全部通过', changes: [{ field: 'status', before: '已发布', after: '验证中' }] },
  { bizType: 'subscriptions', bizId: 'sb03', bizNo: 'DY20260117003', bizTitle: '门急诊就诊明细查询服务订阅', action: '渠道授权', operator: '赵敏', operatorOrg: '平台运营中心', operatedAt: D(-6, 14, 0), ip: '10.20.44.12', terminal: 'Web 端 / Chrome', remark: '使用范围限定市医保局及其应用', changes: [{ field: 'channelAuth.useScope', before: '（空）', after: '市医疗保障局' }] },
  { bizType: 'evaluations', bizId: 'ev03', bizNo: 'PJ20260123003', bizTitle: '对「医疗资源指标日度文件服务」的评价', action: '审批通过', operator: '张建国', operatorOrg: '市卫生健康委员会 · 数据资源管理处', operatedAt: D(-2, 10, 0), ip: '10.20.11.42', terminal: 'Web 端 / Chrome', remark: '评价内容属实，同意展示给供数方', changes: [{ field: 'status', before: '待审批', after: '审批通过' }] },
  { bizType: 'tenants', bizId: 'tn03', bizNo: 'ZH20260110003', bizTitle: '市疾控中心监测租户注册申请', action: '审核通过', operator: '赵敏', operatorOrg: '平台运营中心', operatedAt: D(-150, 11, 0), ip: '10.20.44.12', terminal: 'Web 端 / Chrome', remark: '资质材料齐全', changes: [{ field: 'status', before: '待审核', after: '已通过' }] }
];

/* ============================================== 工单数据（函数式生成）-- */
function buildDemands(): any[] {
  const rows = [
    /* 已评价：完整闭环样本，供"完整旅程"剧本使用 */
    {
      id: 'd01', no: 'XQ20260112001', title: '医保基金监管分析-门急诊费用与就诊明细申请',
      applicant: '李慧敏', applicantOrg: '市医疗保障局', tenantId: 't01', appId: 'app01',
      scene: '用于医保基金监管分析平台的门诊费用异常筛查，识别分解处方、超量开药等违规线索。',
      kind: 'EXISTING', resourceType: 'MODEL', deliveryForm: 'API',
      resources: ['r003', 'r007'], fields: ['visit_no', 'visit_date', 'dept_name', 'diagnosis_code', 'fee_total', 'settle_type'],
      timeRange: '2024-01-01 ~ 2026-01-31', updateFreq: '每日增量', usePeriod: '12 个月', callVolume: 50000,
      desensitize: true, securityLevel: 'L3', priority: 'P1', status: 'EVALUATED', currentHandler: '—',
      source: 'WEB', submittedAt: D(-15, 10, 0), acceptedAt: D(-15, 14, 0), approvedAt: D(-13, 10, 0),
      deliveredAt: D(-9, 16, 0), evaluatedAt: D(-8, 10, 0), expectAt: D(-6, 18, 0),
      approver: '张建国', securityApprover: '周雅静', evaluationId: 'ev01',
      relatedIncidentIds: [], relatedProblemIds: [], taskIds: ['t01'], changeIds: [], subscriptionIds: ['sb01'],
      timeline: [
        { at: D(-15, 10, 0), actor: '李慧敏', action: '提交需求单', comment: '基于服务市场模板创建' },
        { at: D(-15, 14, 0), actor: '王思远', action: '服务台受理', comment: '用途明确，材料齐全，转资源归属方审批' },
        { at: D(-14, 9, 0), actor: '张建国', action: '资源归属方审批通过', comment: '同意共享，涉及 L3 敏感字段需脱敏' },
        { at: D(-13, 10, 0), actor: '周雅静', action: '安全合规审批通过', comment: '按 L3 级别掩码脱敏，授权范围限市医保局' },
        { at: D(-13, 11, 0), actor: '王思远', action: '派发生产任务', comment: '生成任务单 RW20260114001' },
        { at: D(-10, 15, 0), actor: '刘涛', action: '任务实施完成', comment: '完成字段级脱敏配置与视图加工' },
        { at: D(-9, 16, 0), actor: '赵敏', action: '交付与授权', comment: '订阅审批通过，已发放密钥并完成渠道授权' },
        { at: D(-8, 10, 0), actor: '李慧敏', action: '提交评价', comment: '数据质量好，交付及时' }
      ]
    },
    {
      id: 'd02', no: 'XQ20260116002', title: '药品不良反应监测-药品与器械信息申请',
      applicant: '吴强', applicantOrg: '市药品监督管理局', tenantId: 't02', appId: 'app04',
      scene: '用于药品不良反应监测分析，关联药品基本信息与器械材料字典进行品种聚集性信号分析。',
      kind: 'EXISTING', resourceType: 'PARAM', deliveryForm: 'TABLE',
      resources: ['r005', 'r020'], fields: ['drug_code', 'drug_name', 'manufacturer', 'device_code', 'class_level'],
      timeRange: '全量', updateFreq: '每周', usePeriod: '24 个月', callVolume: 0,
      desensitize: false, securityLevel: 'L1', priority: 'P2', status: 'IMPLEMENTING', currentHandler: '刘涛',
      source: 'SERVICE_DESK', submittedAt: D(-11, 9, 0), acceptedAt: D(-11, 10, 0), approvedAt: D(-9, 15, 0),
      expectAt: D(3, 18, 0), approver: '张建国',
      relatedIncidentIds: [], relatedProblemIds: [], taskIds: ['t02'], changeIds: [], subscriptionIds: [],
      timeline: [
        { at: D(-11, 9, 0), actor: '王思远', action: '服务台代提交需求单', comment: '需求方电话申报，服务台代录' },
        { at: D(-9, 15, 0), actor: '张建国', action: '资源归属方审批通过', comment: 'L1 公开数据，同意共享' },
        { at: D(-9, 16, 0), actor: '王思远', action: '派发生产任务', comment: '生成任务单 RW20260118002' },
        { at: D(-4, 10, 0), actor: '刘涛', action: '开始实施', comment: '按主数据标准完成字典贯标' }
      ]
    },
    {
      id: 'd03', no: 'XQ20260119003', title: '三医一张图-医疗资源与床位数据申请',
      applicant: '张建国', applicantOrg: '市卫生健康委员会', tenantId: 't03', appId: 'app06',
      scene: '用于三医一张图可视化展示，需要各行政区医疗机构数、床位数、卫生人员数等资源指标。',
      kind: 'EXISTING', resourceType: 'METRIC', deliveryForm: 'FILE',
      resources: ['r013', 'r001'], fields: ['metric_code', 'metric_value', 'district', 'org_name', 'bed_count'],
      timeRange: '2025-01-01 ~ 2026-01-31', updateFreq: '每日', usePeriod: '长期', callVolume: 0,
      desensitize: false, securityLevel: 'L2', priority: 'P1', status: 'DELIVERED', currentHandler: '—',
      source: 'WEB', submittedAt: D(-8, 14, 0), acceptedAt: D(-8, 15, 0), approvedAt: D(-6, 11, 0),
      deliveredAt: D(-2, 10, 0), expectAt: D(-1, 18, 0), approver: '孙立',
      relatedIncidentIds: [], relatedProblemIds: [], taskIds: ['t04'], changeIds: [], subscriptionIds: ['sb02'],
      timeline: [
        { at: D(-8, 14, 0), actor: '张建国', action: '提交需求单' },
        { at: D(-8, 15, 0), actor: '王思远', action: '服务台受理' },
        { at: D(-6, 11, 0), actor: '孙立', action: '资源归属方审批通过', comment: '本部门内部申请，同意' },
        { at: D(-6, 12, 0), actor: '王思远', action: '派发生产任务', comment: '生成任务单 RW20260121004' },
        { at: D(-3, 17, 0), actor: '刘涛', action: '任务实施完成' },
        { at: D(-2, 10, 0), actor: '赵敏', action: '文件服务订阅审批通过并下发', comment: '每日 03:00 全量下发' }
      ]
    },
    {
      id: 'd04', no: 'XQ20260121004', title: '传染病监测预警-报告信息与就诊记录申请',
      applicant: '郑晓', applicantOrg: '市疾病预防控制中心', tenantId: 't04', appId: 'app08',
      scene: '用于传染病监测预警，需按日获取法定传染病报告信息与相关门急诊就诊记录进行症状监测。',
      kind: 'EXISTING', resourceType: 'MODEL', deliveryForm: 'API',
      resources: ['r010', 'r003'], fields: ['report_no', 'disease_code', 'onset_date', 'report_org', 'visit_date', 'diagnosis_code'],
      timeRange: '近 24 个月', updateFreq: '实时', usePeriod: '长期', callVolume: 200000,
      desensitize: true, securityLevel: 'L3', priority: 'P0', status: 'PENDING_ACCEPTANCE', currentHandler: '郑晓',
      source: 'WEB', submittedAt: D(-6, 9, 0), acceptedAt: D(-6, 10, 0), approvedAt: D(-4, 16, 0),
      expectAt: D(0, 18, 0), approver: '张建国', securityApprover: '周雅静',
      relatedIncidentIds: [], relatedProblemIds: [], taskIds: ['t05'], changeIds: [], subscriptionIds: [],
      timeline: [
        { at: D(-6, 9, 0), actor: '郑晓', action: '提交需求单', comment: '疾控监测预警需要，优先级 P0' },
        { at: D(-6, 10, 0), actor: '王思远', action: '服务台受理', comment: '公共卫生场景，加急处理' },
        { at: D(-5, 9, 0), actor: '张建国', action: '资源归属方审批通过' },
        { at: D(-4, 16, 0), actor: '周雅静', action: '安全合规审批通过', comment: '患者标识按 L3 掩码，禁止转供第三方' },
        { at: D(-4, 17, 0), actor: '王思远', action: '派发生产任务', comment: '生成任务单 RW20260124005' },
        { at: D(-1, 15, 0), actor: '刘涛', action: '提交待验收', comment: '实时推送链路已联调通过' }
      ]
    },
    {
      id: 'd05', no: 'XQ20260118005', title: '医保支付方式改革评估-结算与住院数据申请',
      applicant: '李慧敏', applicantOrg: '市医疗保障局', tenantId: 't01', appId: 'app03',
      scene: '用于 DRG/DIP 支付方式改革效果评估，需住院结算数据与主要诊断、手术信息。',
      kind: 'EXISTING', resourceType: 'MODEL', deliveryForm: 'TABLE',
      resources: ['r004', 'r007'], fields: ['inp_no', 'admit_date', 'main_diag', 'operation_name', 'los_days', 'fund_pay'],
      timeRange: '2023-01-01 ~ 2025-12-31', updateFreq: '每月', usePeriod: '18 个月', callVolume: 0,
      desensitize: true, securityLevel: 'L3', priority: 'P1', status: 'APPROVED', currentHandler: '刘涛',
      source: 'TEMPLATE', templateId: 'tpl01', submittedAt: D(-5, 11, 0), acceptedAt: D(-5, 14, 0),
      approvedAt: D(-2, 10, 0), expectAt: D(5, 18, 0), approver: '张建国',
      relatedIncidentIds: [], relatedProblemIds: [], taskIds: [], changeIds: [], subscriptionIds: [],
      timeline: [
        { at: D(-5, 11, 0), actor: '李慧敏', action: '基于模板提交需求单', comment: '使用「跨部门数据共享申请（标准模板）」' },
        { at: D(-5, 14, 0), actor: '王思远', action: '服务台受理' },
        { at: D(-2, 10, 0), actor: '张建国', action: '资源归属方审批通过', comment: '同意共享，待派发生产任务' }
      ]
    },
    {
      id: 'd06', no: 'XQ20260124006', title: '突发公共事件应急调度-医疗资源与急救信息申请',
      applicant: '黄伟', applicantOrg: '市应急管理局', tenantId: 't05', appId: null,
      scene: '突发事件应急指挥时需快速掌握周边医疗资源与急救调度能力，用于应急力量调度决策。',
      kind: 'EXISTING', resourceType: 'MODEL', deliveryForm: 'API',
      resources: ['r001', 'r018'], fields: ['org_code', 'org_name', 'bed_count', 'dispatch_no', 'response_min'],
      timeRange: '实时', updateFreq: '实时', usePeriod: '长期', callVolume: 20000,
      desensitize: false, securityLevel: 'L2', priority: 'P0', status: 'PENDING_APPROVE', currentHandler: '张建国',
      source: 'EMAIL', submittedAt: D(-2, 8, 0), acceptedAt: D(-2, 9, 0), expectAt: D(1, 18, 0),
      relatedIncidentIds: [], relatedProblemIds: [], taskIds: [], changeIds: [], subscriptionIds: [],
      timeline: [
        { at: D(-2, 8, 0), actor: '王思远', action: '邮件转工单', comment: '服务台邮箱收到应急局申请，按预定义类别自动建单' },
        { at: D(-2, 9, 0), actor: '王思远', action: '服务台受理', comment: '应急场景，标记 P0 加急' },
        { at: D(-2, 9, 0), actor: '王思远', action: '提交资源归属方审批', comment: '等待市卫健委审批' }
      ]
    },
    {
      id: 'd07', no: 'XQ20260125007', title: '慢病管理分析-患者随访与标签数据申请',
      applicant: '郑晓', applicantOrg: '市疾病预防控制中心', tenantId: 't04', appId: 'app08',
      scene: '用于高血压、糖尿病患者管理效果评估，需随访记录与慢病管理标签。',
      kind: 'EXISTING', resourceType: 'TAG', deliveryForm: 'TABLE',
      resources: ['r014'], fields: ['subject_id', 'tag_code', 'tag_value', 'update_time'],
      timeRange: '近 36 个月', updateFreq: '每月', usePeriod: '12 个月', callVolume: 0,
      desensitize: true, securityLevel: 'L3', priority: 'P2', status: 'PENDING_ACCEPT', currentHandler: '王思远',
      source: 'SELF', submittedAt: D(-1, 14, 0), expectAt: D(6, 18, 0),
      relatedIncidentIds: [], relatedProblemIds: [], taskIds: [], changeIds: [], subscriptionIds: [],
      timeline: [{ at: D(-1, 14, 0), actor: '郑晓', action: '通过自助服务提交需求单', comment: '等待服务台受理' }]
    },
    {
      id: 'd08', no: 'XQ20260126008', title: '新增采集需求-药品流通与采购信息',
      applicant: '吴强', applicantOrg: '市药品监督管理局', tenantId: 't02', appId: 'app05',
      scene: '现有主题库未覆盖药品流通环节数据，需新增采集药品采购与库存信息，支撑药品供应保障分析。',
      kind: 'NEW', resourceType: 'RAW', deliveryForm: 'TABLE',
      resources: [], fields: [], newDataDesc: '药品采购信息（采购单号、药品编码、采购数量、采购金额、供应商、采购日期）与药品库存信息（药品编码、库存数量、库存金额、统计日期）',
      timeRange: '2024-01-01 起', updateFreq: '每月', usePeriod: '长期', callVolume: 0,
      desensitize: false, securityLevel: 'L2', priority: 'P1', status: 'IMPLEMENTING', currentHandler: '何静',
      source: 'TEMPLATE', templateId: 'tpl03', submittedAt: D(-3, 10, 0), acceptedAt: D(-3, 11, 0),
      approvedAt: D(-1, 15, 0), expectAt: D(14, 18, 0), approver: '张建国',
      relatedIncidentIds: [], relatedProblemIds: [], taskIds: ['t06'], changeIds: [], subscriptionIds: [],
      timeline: [
        { at: D(-3, 10, 0), actor: '吴强', action: '基于「新增数据采集 / 加工需求」模板提交' },
        { at: D(-3, 11, 0), actor: '王思远', action: '服务台受理', comment: '确认主题库确实未覆盖' },
        { at: D(-1, 15, 0), actor: '张建国', action: '资源归属方审批通过' },
        { at: D(-1, 16, 0), actor: '王思远', action: '派发采集与加工任务', comment: '生成任务单 RW20260126006' },
        { at: D(0, 9, 0), actor: '何静', action: '开始实施', comment: '与药监局协调采集接口' }
      ]
    },
    {
      id: 'd09', no: 'XQ20260115009', title: '科研课题-重点疾病分布与手术信息申请',
      applicant: '马超', applicantOrg: '北京大学第三医院', tenantId: 't03', appId: 'app07',
      scene: '心血管疾病区域分布科研课题，需在数据沙箱内使用，成果仅输出统计结果。',
      kind: 'EXISTING', resourceType: 'MODEL', deliveryForm: 'FILE',
      resources: ['r004', 'r003'], fields: ['main_diag', 'operation_name', 'los_days', 'district'],
      timeRange: '2022-01-01 ~ 2025-12-31', updateFreq: '一次性', usePeriod: '课题周期内', callVolume: 0,
      desensitize: true, securityLevel: 'L3', priority: 'P3', status: 'REJECTED', currentHandler: '—',
      source: 'MARKET', submittedAt: D(-12, 15, 0), acceptedAt: D(-12, 16, 0), rejectedAt: D(-10, 10, 0),
      rejectReason: '申请范围超出课题必要范围（申请了完整就诊明细），请按最小必要原则缩小字段范围后重新提交，并补充课题立项证明材料。',
      approver: '张建国',
      relatedIncidentIds: [], relatedProblemIds: [], taskIds: [], changeIds: [], subscriptionIds: [],
      timeline: [
        { at: D(-12, 15, 0), actor: '马超', action: '基于服务市场提交需求单' },
        { at: D(-12, 16, 0), actor: '王思远', action: '服务台受理' },
        { at: D(-10, 10, 0), actor: '张建国', action: '审批驳回', comment: '申请范围超出课题必要范围，请缩小字段范围并补充立项证明' }
      ]
    },
    {
      id: 'd10', no: 'XQ20260126010', title: '儿童免疫接种分析-接种记录申请',
      applicant: '郑晓', applicantOrg: '市疾病预防控制中心', tenantId: 't04', appId: null,
      scene: '用于免疫接种覆盖率分析与查漏补种。',
      kind: 'EXISTING', resourceType: 'MODEL', deliveryForm: 'TABLE',
      resources: ['r010'], fields: ['disease_code', 'onset_date'],
      timeRange: '近 12 个月', updateFreq: '每月', usePeriod: '6 个月', callVolume: 0,
      desensitize: true, securityLevel: 'L3', priority: 'P2', status: 'DRAFT', currentHandler: '郑晓',
      source: 'WEB', submittedAt: null, expectAt: null,
      relatedIncidentIds: [], relatedProblemIds: [], taskIds: [], changeIds: [], subscriptionIds: [],
      timeline: [{ at: D(-1, 17, 0), actor: '郑晓', action: '保存草稿', comment: '待补充字段级申请清单' }]
    },
    {
      id: 'd11', no: 'XQ20260123011', title: '药品不良反应聚集性信号分析-补充数据申请',
      applicant: '吴强', applicantOrg: '市药品监督管理局', tenantId: 't02', appId: 'app04',
      scene: '在药品不良反应监测基础上补充门急诊就诊数据，用于聚集性信号验证。',
      kind: 'EXISTING', resourceType: 'MODEL', deliveryForm: 'API',
      resources: ['r003', 'r008'], fields: ['visit_no', 'diagnosis_code', 'drug_code', 'reaction'],
      timeRange: '近 18 个月', updateFreq: '每周', usePeriod: '12 个月', callVolume: 30000,
      desensitize: true, securityLevel: 'L3', priority: 'P2', status: 'WITHDRAWN', currentHandler: '—',
      source: 'WEB', submittedAt: D(-4, 11, 0), withdrawnAt: D(-4, 16, 0),
      relatedIncidentIds: [], relatedProblemIds: [], taskIds: [], changeIds: [], subscriptionIds: [],
      timeline: [
        { at: D(-4, 11, 0), actor: '吴强', action: '提交需求单' },
        { at: D(-4, 16, 0), actor: '吴强', action: '撤回需求单', comment: '需求范围需与业务处室再确认，撤回后修改重新提交' }
      ]
    },
    {
      id: 'd12', no: 'XQ20260117012', title: '医疗资源专题-卫生人员与床位数据申请',
      applicant: '张建国', applicantOrg: '市卫生健康委员会', tenantId: 't03', appId: 'app07',
      scene: '医疗资源专题分析，需卫生人员职称结构与床位使用情况数据。',
      kind: 'EXISTING', resourceType: 'MODEL', deliveryForm: 'TABLE',
      resources: ['r002', 'r001'], fields: ['staff_id', 'dept_name', 'title', 'org_name', 'bed_count'],
      timeRange: '2025-01-01 ~ 2025-12-31', updateFreq: '每季度', usePeriod: '12 个月', callVolume: 0,
      desensitize: true, securityLevel: 'L3', priority: 'P2', status: 'CHANGING', currentHandler: '张建国',
      source: 'WEB', submittedAt: D(-10, 9, 0), acceptedAt: D(-10, 10, 0), approvedAt: D(-8, 15, 0),
      deliveredAt: D(-4, 16, 0), expectAt: D(-3, 18, 0), approver: '孙立', changeIds: ['c01'],
      relatedIncidentIds: [], relatedProblemIds: [], taskIds: ['t07'], subscriptionIds: [],
      timeline: [
        { at: D(-10, 9, 0), actor: '张建国', action: '提交需求单' },
        { at: D(-8, 15, 0), actor: '孙立', action: '审批通过' },
        { at: D(-4, 16, 0), actor: '赵敏', action: '交付（库表视图授权）' },
        { at: D(-2, 11, 0), actor: '张建国', action: '发起需求变更', comment: '补充「科室床位使用率」字段，变更单 c01' }
      ]
    },
    {
      id: 'd13', no: 'XQ20260122013', title: '京智三医联动可视化-指标与标签数据申请',
      applicant: '孙立', applicantOrg: '三医联动信息化工作领导小组办公室', tenantId: 't03', appId: 'app06',
      scene: '面向决策层的三医联动可视化分析，需医疗资源指标与慢病标签汇总数据。',
      kind: 'EXISTING', resourceType: 'METRIC', deliveryForm: 'API',
      resources: ['r013', 'r014'], fields: ['metric_code', 'metric_value', 'tag_code', 'tag_value'],
      timeRange: '2025-01-01 ~ 2026-01-31', updateFreq: '每日', usePeriod: '长期', callVolume: 100000,
      desensitize: true, securityLevel: 'L2', priority: 'P1', status: 'PENDING_ACCEPTANCE', currentHandler: '孙立',
      source: 'WEB', submittedAt: D(-5, 9, 0), acceptedAt: D(-5, 10, 0), approvedAt: D(-3, 14, 0),
      expectAt: D(0, 18, 0), approver: '张建国',
      relatedIncidentIds: [], relatedProblemIds: [], taskIds: ['t08'], subscriptionIds: [],
      timeline: [
        { at: D(-5, 9, 0), actor: '孙立', action: '提交需求单', comment: '决策层可视化使用' },
        { at: D(-3, 14, 0), actor: '张建国', action: '审批通过' },
        { at: D(-1, 10, 0), actor: '刘涛', action: '提交待验收' }
      ]
    },
    {
      id: 'd14', no: 'XQ20260120014', title: '血液管理专题-血液采集与供应数据申请',
      applicant: '张建国', applicantOrg: '市卫生健康委员会', tenantId: 't03', appId: 'app07',
      scene: '血液管理专题分析，需血液采集、检测与供应数据。',
      kind: 'EXISTING', resourceType: 'MODEL', deliveryForm: 'FILE',
      resources: ['r009'], fields: ['blood_no', 'blood_type', 'collect_date', 'component', 'supply_org'],
      timeRange: '2025-01-01 ~ 2025-12-31', updateFreq: '每月', usePeriod: '12 个月', callVolume: 0,
      desensitize: false, securityLevel: 'L2', priority: 'P3', status: 'DELIVERED', currentHandler: '—',
      source: 'WEB', submittedAt: D(-7, 10, 0), acceptedAt: D(-7, 11, 0), approvedAt: D(-5, 9, 0),
      deliveredAt: D(-2, 15, 0), expectAt: D(-1, 18, 0), approver: '孙立',
      relatedIncidentIds: [], relatedProblemIds: [], taskIds: [], changeIds: [], subscriptionIds: [],
      timeline: [
        { at: D(-7, 10, 0), actor: '张建国', action: '提交需求单' },
        { at: D(-5, 9, 0), actor: '孙立', action: '审批通过' },
        { at: D(-2, 15, 0), actor: '赵敏', action: '文件服务下发配置完成并交付' }
      ]
    },
    {
      id: 'd15', no: 'XQ20260113015', title: '死亡登记与人口健康分析-基础信息申请',
      applicant: '李慧敏', applicantOrg: '市医疗保障局', tenantId: 't01', appId: 'app02',
      scene: '参保人健康画像分析，需死亡登记信息用于参保状态核验。',
      kind: 'EXISTING', resourceType: 'MODEL', deliveryForm: 'TABLE',
      resources: ['r001'], fields: ['org_code', 'district'],
      timeRange: '近 12 个月', updateFreq: '每日', usePeriod: '12 个月', callVolume: 0,
      desensitize: true, securityLevel: 'L3', priority: 'P2', status: 'CANCELLED', currentHandler: '—',
      source: 'WEB', submittedAt: D(-14, 10, 0), cancelledAt: D(-13, 9, 0),
      cancelReason: '经与业务处室确认，该项数据已在其他平台具备，本需求作废。',
      relatedIncidentIds: [], relatedProblemIds: [], taskIds: [], changeIds: [], subscriptionIds: [],
      timeline: [
        { at: D(-14, 10, 0), actor: '李慧敏', action: '提交需求单' },
        { at: D(-13, 9, 0), actor: '李慧敏', action: '作废需求单', comment: '数据已在其他平台具备，本需求作废' }
      ]
    },
    /* 由事件创建的需求（体现"通过事件、问题来创建需求"） */
    {
      id: 'd16', no: 'XQ20260126016', title: '门急诊就诊记录数据延迟整改-服务能力提升需求',
      applicant: '陈志刚', applicantOrg: '运维中心 · 二线支持组', tenantId: 't03', appId: 'app06',
      scene: '针对事件 SJ20260125002（门急诊就诊记录未按时更新）暴露的采集批次缺失问题，提出服务能力提升需求。',
      kind: 'NEW', resourceType: 'RAW', deliveryForm: 'TABLE',
      resources: [], fields: [], newDataDesc: '新增上游采集批次完整性校验机制与批次缺失自动补采能力，涉及采集调度与稽核规则调整。',
      timeRange: '自 2026-02-01 起', updateFreq: '每日', usePeriod: '长期', callVolume: 0,
      desensitize: false, securityLevel: 'L2', priority: 'P1', status: 'PENDING_APPROVE', currentHandler: '张建国',
      source: 'EVENT', submittedAt: D(-1, 10, 0), acceptedAt: D(-1, 11, 0), expectAt: D(10, 18, 0),
      relatedIncidentIds: ['i02'], relatedProblemIds: ['p01'], taskIds: [], changeIds: [], subscriptionIds: [],
      timeline: [
        { at: D(-1, 10, 0), actor: '陈志刚', action: '由事件单 SJ20260125002 创建需求单', comment: '作为问题 p01 的根治方案落地载体' },
        { at: D(-1, 11, 0), actor: '王思远', action: '服务台受理' },
        { at: D(-1, 11, 0), actor: '王思远', action: '提交资源归属方审批' }
      ]
    }
  ];
  return rows;
}

function buildChanges(): any[] {
  return [
    {
      id: 'c01', no: 'BG20260125001', title: '医疗资源专题-卫生人员数据补充字段变更',
      demandId: 'd12', demandNo: 'XQ20260117012', category: '范围变更', priority: 'P2',
      implementDate: DD(2), requestor: '张建国', implementer: '刘涛',
      plan: '在已交付的卫生人员视图上补充「科室床位使用率」字段，同步更新库表视图授权范围，变更后向已授权用户同步更新。',
      resources: ['r002', 'r001'], riskLevel: '中', status: 'IMPLEMENTING',
      impact: {
        ciList: ['ci03 HIVE 数据仓库', 'ci04 dwd_org_medical_institution'],
        services: ['sv07 医疗机构信息全量文件服务'],
        tenants: ['t03 市卫健委数据资源租户'],
        suggestion: '建议在业务低峰期（22:00 之后）执行视图重建，重建期间文件服务沿用上一版本快照，避免订阅方取到中间态数据。'
      },
      conflicts: [
        { type: '时间窗', with: 'c03（医保结算增量文件服务字段扩展）', desc: '两个变更的实施窗口重叠（同为 01-29 22:00-24:00），且均依赖 ci03 HIVE 集群资源。', suggestion: '建议将本变更顺延至 01-30 22:00 执行，错开重算窗口。' },
        { type: '服务依赖', with: 'sv07 医疗机构信息全量文件服务', desc: 'sv07 依赖本变更涉及的 dwd_org_medical_institution，变更期间服务若被调用可能返回字段缺失。', suggestion: '建议变更前发布服务维护公告，或启用灰度视图后切换。' }
      ],
      submittedAt: D(-2, 11, 0), approvedAt: D(-1, 10, 0), approver: '孙立', expectAt: DD(2),
      relatedIncidentIds: [], relatedProblemIds: [],
      timeline: [
        { at: D(-2, 11, 0), actor: '张建国', action: '发起需求变更', comment: '业务需要补充床位使用率字段' },
        { at: D(-2, 15, 0), actor: '刘涛', action: '风险评估', comment: '基于 CMDB 影响模拟，影响 2 个配置项、1 个服务、1 个租户，风险等级：中' },
        { at: D(-2, 16, 0), actor: '陈志刚', action: '冲突分析', comment: '检出 2 类冲突：时间窗冲突、服务依赖冲突' },
        { at: D(-1, 10, 0), actor: '孙立', action: '变更审批通过', comment: '同意变更，实施窗口按冲突分析建议顺延' },
        { at: D(0, 9, 0), actor: '刘涛', action: '开始实施' }
      ]
    },
    {
      id: 'c02', no: 'BG20260123002', title: '门急诊就诊明细查询服务-字段范围调整',
      demandId: 'd01', demandNo: 'XQ20260112001', category: '服务变更', priority: 'P1',
      implementDate: DD(1), requestor: '李慧敏', implementer: '赵敏',
      plan: '在门急诊就诊明细查询服务中增加「settle_type 结算类别」出参字段，同步更新接口文档并通知已订阅应用。',
      resources: ['r003'], riskLevel: '中', status: 'APPROVED',
      impact: {
        ciList: ['ci05 dwd_visit_outpatient', 'ci08 门急诊就诊明细查询服务'],
        services: ['sv03 门急诊就诊明细查询服务'],
        tenants: ['t01 市医保局数据应用租户'],
        suggestion: '字段为新增出参，对既有调用方向后兼容；建议同步更新接口文档并向 3 个已订阅应用发送变更通知。'
      },
      conflicts: [
        { type: '资源占用', with: 'c03（医保结算增量文件服务字段扩展）', desc: '两个变更均需重建 DORIS 上的聚合视图，存在资源竞争。', suggestion: '建议错峰执行，本变更安排在 01-28 20:00 执行。' }
      ],
      submittedAt: D(-4, 15, 0), approvedAt: D(-3, 11, 0), approver: '孙立', expectAt: DD(1),
      relatedIncidentIds: [], relatedProblemIds: [],
      timeline: [
        { at: D(-4, 15, 0), actor: '李慧敏', action: '发起需求变更' },
        { at: D(-4, 16, 0), actor: '刘涛', action: '风险评估', comment: '影响模拟完成，风险等级：中' },
        { at: D(-3, 9, 0), actor: '陈志刚', action: '冲突分析', comment: '检出资源占用冲突 1 项' },
        { at: D(-3, 11, 0), actor: '孙立', action: '变更审批通过' }
      ]
    },
    {
      id: 'c03', no: 'BG20260126003', title: '医保结算增量文件服务-字段扩展变更',
      demandId: 'd05', demandNo: 'XQ20260118005', category: '资源变更', priority: 'P1',
      implementDate: DD(2), requestor: '李慧敏', implementer: '刘涛',
      plan: '在医保结算增量文件中增加 DRG 分组相关字段（drg_code、drg_group），支撑支付方式改革评估。',
      resources: ['r007'], riskLevel: '高', status: 'PENDING_APPROVE',
      impact: {
        ciList: ['ci02 DORIS 分析型数据库', 'ci06 dwd_mi_settlement', 'ci09 医保结算信息查询服务'],
        services: ['sv04 医保结算信息查询服务', 'sv09 医保结算信息增量文件服务'],
        tenants: ['t01 市医保局数据应用租户'],
        suggestion: '涉及 L3 敏感资源字段扩展，建议增加安全合规复核；文件格式变化会影响 12 个订阅方，需提前发布变更通知并保留旧版本一段时间。'
      },
      conflicts: [],
      submittedAt: D(-1, 14, 0), expectAt: DD(2),
      relatedIncidentIds: [], relatedProblemIds: [],
      timeline: [{ at: D(-1, 14, 0), actor: '李慧敏', action: '发起需求变更', comment: 'DRG 评估需要分组字段' }]
    },
    {
      id: 'c04', no: 'BG20260120004', title: '医疗资源指标口径调整（每千人口床位数）',
      demandId: 'd03', demandNo: 'XQ20260119003', category: '范围变更', priority: 'P2',
      implementDate: DD(-2), requestor: '张建国', implementer: '刘涛',
      plan: '按最新常住人口口径调整「每千人口床位数」指标分母。',
      resources: ['r013'], riskLevel: '低', status: 'DONE',
      impact: { ciList: ['ci10 医疗资源指标日度文件服务'], services: ['sv08'], tenants: ['t01', 't03'], suggestion: '指标口径变更需同步更新指标说明与知识库。' },
      conflicts: [],
      submittedAt: D(-6, 10, 0), approvedAt: D(-5, 10, 0), approver: '孙立', expectAt: DD(-2),
      doneAt: D(-2, 16, 0),
      relatedIncidentIds: [], relatedProblemIds: [],
      timeline: [
        { at: D(-6, 10, 0), actor: '张建国', action: '发起需求变更' },
        { at: D(-5, 10, 0), actor: '孙立', action: '审批通过' },
        { at: D(-2, 16, 0), actor: '刘涛', action: '变更完成', comment: '已同步更新指标说明与知识条目 k13' }
      ]
    },
    {
      id: 'c05', no: 'BG20260127005', title: '传染病报告实时推送服务-推送频率调整',
      demandId: 'd04', demandNo: 'XQ20260121004', category: '计划变更', priority: 'P1',
      implementDate: DD(3), requestor: '郑晓', implementer: '刘涛',
      plan: '将传染病报告实时推送频率由 5 分钟调整为 1 分钟，满足疾控监测预警时效要求。',
      resources: ['r010'], riskLevel: '中', status: 'PENDING_APPROVE',
      impact: { ciList: ['ci11 门急诊就诊实时推送服务', 'ci16 Kafka 消息队列集群'], services: ['sv11'], tenants: ['t04'], suggestion: '推送频率提升会显著增加消息量，建议先评估 Kafka 集群容量并观察 3 天。' },
      conflicts: [],
      submittedAt: D(0, 9, 0), expectAt: DD(3),
      relatedIncidentIds: [], relatedProblemIds: [],
      timeline: [{ at: D(0, 9, 0), actor: '郑晓', action: '发起需求变更' }]
    },
    {
      id: 'c06', no: 'BG20260119006', title: '药品字典贯标范围变更',
      demandId: 'd02', demandNo: 'XQ20260116002', category: '资源变更', priority: 'P3',
      implementDate: DD(-4), requestor: '吴强', implementer: '刘涛',
      plan: '扩大药品字典贯标范围，纳入院内制剂品种。',
      resources: ['r005'], riskLevel: '低', status: 'WITHDRAWN',
      impact: { ciList: ['ci03'], services: ['sv05'], tenants: ['t02'], suggestion: '院内制剂无统一编码，贯标难度较大。' },
      conflicts: [], submittedAt: D(-8, 15, 0), withdrawnAt: D(-7, 9, 0),
      relatedIncidentIds: [], relatedProblemIds: [],
      timeline: [
        { at: D(-8, 15, 0), actor: '吴强', action: '发起需求变更' },
        { at: D(-7, 9, 0), actor: '吴强', action: '撤回变更单', comment: '院内制剂编码方案需先与药监局标准化处确认' }
      ]
    }
  ];
}

function buildTasks(): any[] {
  return [
    {
      id: 't01', no: 'RW20260114001', title: '门急诊就诊明细视图加工与脱敏配置', type: '数据加工',
      source: 'DEMAND', sourceId: 'd01', sourceNo: 'XQ20260112001',
      dept: '数据生产中心 · 加工组', assignee: '刘涛', priority: 'P1',
      planStart: DD(-13), planEnd: DD(-10), progress: 100, status: 'DONE', verifyResult: '通过',
      content: '基于 dwd_visit_outpatient 与 dwd_mi_settlement 加工门急诊就诊明细视图，完成字段级 L3 掩码脱敏配置，输出可供 API 服务调用的结果表。',
      deliverable: '视图 v_visit_outpatient_masked（含 6 个申请字段），脱敏规则配置单',
      resources: ['r003', 'r007'],
      milestones: [
        { name: '需求确认', planDate: DD(-13), doneDate: DD(-13) },
        { name: '视图开发', planDate: DD(-11), doneDate: DD(-11) },
        { name: '脱敏配置与测试', planDate: DD(-10), doneDate: DD(-10) }
      ],
      relatedProblemIds: [],
      timeline: [
        { at: D(-13, 11, 0), actor: '王思远', action: '派发任务', comment: '承接需求单 XQ20260112001' },
        { at: D(-13, 14, 0), actor: '刘涛', action: '接单' },
        { at: D(-11, 17, 0), actor: '刘涛', action: '填报进度 60%', comment: '视图主体开发完成，进入脱敏配置' },
        { at: D(-10, 15, 0), actor: '刘涛', action: '提交验证', comment: '脱敏效果自测通过' },
        { at: D(-10, 16, 0), actor: '张建国', action: '验证通过', comment: '抽样比对一致，脱敏符合 L3 要求' }
      ]
    },
    {
      id: 't02', no: 'RW20260118002', title: '药品与器械字典贯标加工', type: '数据加工',
      source: 'DEMAND', sourceId: 'd02', sourceNo: 'XQ20260116002',
      dept: '数据生产中心 · 加工组', assignee: '刘涛', priority: 'P2',
      planStart: DD(-9), planEnd: DD(-1), progress: 75, status: 'DOING',
      content: '按三医主数据标准完成药品基本信息与医疗器械材料字典的贯标，输出标准字典表供资源目录检索与关联。',
      deliverable: 'dim_drug_base、dim_device_material 贯标后字典表 + 贯标说明',
      resources: ['r005', 'r020'],
      milestones: [
        { name: '字典比对', planDate: DD(-7), doneDate: DD(-7) },
        { name: '编码映射', planDate: DD(-4), doneDate: DD(-3) },
        { name: '贯标验证', planDate: DD(-1) }
      ],
      relatedProblemIds: [],
      timeline: [
        { at: D(-9, 16, 0), actor: '王思远', action: '派发任务' },
        { at: D(-9, 17, 0), actor: '刘涛', action: '接单' },
        { at: D(-3, 15, 0), actor: '刘涛', action: '填报进度 75%', comment: '编码映射完成，剩余验证工作' }
      ]
    },
    {
      id: 't03', no: 'RW20260119003', title: '门急诊就诊明细视图加工（第二批字段）', type: '数据加工',
      source: 'DEMAND', sourceId: 'd01', sourceNo: 'XQ20260112001',
      dept: '数据生产中心 · 加工组', assignee: '刘涛', priority: 'P2',
      planStart: DD(-7), planEnd: DD(-2), progress: 100, status: 'DONE', verifyResult: '通过',
      content: '补充结算类别等字段的门急诊就诊明细视图加工。',
      deliverable: '视图 v_visit_outpatient_masked v2',
      resources: ['r003'],
      milestones: [{ name: '字段加工', planDate: DD(-5), doneDate: DD(-5) }, { name: '验证', planDate: DD(-2), doneDate: DD(-2) }],
      relatedProblemIds: [],
      timeline: [
        { at: D(-7, 9, 0), actor: '王思远', action: '派发任务' },
        { at: D(-7, 9, 0), actor: '刘涛', action: '接单' },
        { at: D(-2, 15, 0), actor: '张建国', action: '验证通过' }
      ]
    },
    {
      id: 't04', no: 'RW20260121004', title: '医疗资源指标日度快照加工', type: '数据建模',
      source: 'DEMAND', sourceId: 'd03', sourceNo: 'XQ20260119003',
      dept: '数据生产中心 · 建模组', assignee: '刘涛', priority: 'P1',
      planStart: DD(-6), planEnd: DD(-3), progress: 100, status: 'DONE', verifyResult: '通过',
      content: '构建医疗资源指标日度快照模型，覆盖 32 项指标的行政区维度汇总。',
      deliverable: 'DWA 层指标快照表 metric_medical_resource_d',
      resources: ['r013', 'r001'],
      milestones: [{ name: '模型设计', planDate: DD(-5), doneDate: DD(-5) }, { name: '开发与调度', planDate: DD(-4), doneDate: DD(-4) }, { name: '验证', planDate: DD(-3), doneDate: DD(-3) }],
      relatedProblemIds: [],
      timeline: [
        { at: D(-6, 12, 0), actor: '王思远', action: '派发任务' },
        { at: D(-3, 17, 0), actor: '刘涛', action: '提交验证' },
        { at: D(-3, 18, 0), actor: '张建国', action: '验证通过' }
      ]
    },
    {
      id: 't05', no: 'RW20260124005', title: '传染病报告实时推送链路联调', type: '服务封装',
      source: 'DEMAND', sourceId: 'd04', sourceNo: 'XQ20260121004',
      dept: '数据生产中心 · 加工组', assignee: '刘涛', priority: 'P0',
      planStart: DD(-4), planEnd: DD(0), progress: 90, status: 'PENDING_VERIFY',
      content: '封装传染病报告实时推送服务，联调 Kafka → Flink → 订阅方通道，完成 L3 脱敏后推送。',
      deliverable: '实时服务 sv11 配置 + 联调报告',
      resources: ['r010'],
      milestones: [{ name: '通道搭建', planDate: DD(-3), doneDate: DD(-3) }, { name: '脱敏联调', planDate: DD(-1), doneDate: DD(-1) }, { name: '验证', planDate: DD(0) }],
      relatedProblemIds: [],
      timeline: [
        { at: D(-4, 17, 0), actor: '王思远', action: '派发任务', comment: 'P0 加急' },
        { at: D(-4, 17, 0), actor: '刘涛', action: '接单' },
        { at: D(-1, 15, 0), actor: '刘涛', action: '提交验证', comment: '实时推送链路已联调通过，等待验收' }
      ]
    },
    {
      id: 't06', no: 'RW20260126006', title: '药品采购与库存数据采集（新增数据源）', type: '数据采集',
      source: 'DEMAND', sourceId: 'd08', sourceNo: 'XQ20260126008',
      dept: '数据生产中心 · 采集组', assignee: '何静', priority: 'P1',
      planStart: DD(-1), planEnd: DD(12), progress: 15, status: 'DOING',
      content: '对接药监局药品流通系统，新增采集药品采购信息与药品库存信息，按三医主数据标准完成贯标后入 ODS 层。',
      deliverable: 'ods_drug_purchase、ods_drug_stock 两张采集表 + 采集配置',
      resources: [],
      milestones: [
        { name: '接口协调', planDate: DD(1) },
        { name: '采集开发', planDate: DD(6) },
        { name: '贯标与验证', planDate: DD(12) }
      ],
      relatedProblemIds: [],
      timeline: [
        { at: D(-1, 16, 0), actor: '王思远', action: '派发任务', comment: '承接新增资产需求 XQ20260126008' },
        { at: D(0, 9, 0), actor: '何静', action: '接单并开始实施', comment: '已与药监局信息处对接采集接口' }
      ]
    },
    {
      id: 't07', no: 'RW20260118007', title: '卫生人员视图字段补充（变更实施）', type: '数据加工',
      source: 'MANUAL', sourceId: 'c01', sourceNo: 'BG20260125001',
      dept: '数据生产中心 · 加工组', assignee: '刘涛', priority: 'P2',
      planStart: DD(2), planEnd: DD(4), progress: 0, status: 'PENDING_ACCEPT',
      content: '按变更单 BG20260125001 要求在卫生人员视图补充「科室床位使用率」字段，并同步更新授权。',
      deliverable: '视图 v_medical_staff v2（含床位使用率）',
      resources: ['r002', 'r001'],
      milestones: [{ name: '视图重建', planDate: DD(2) }, { name: '授权同步', planDate: DD(3) }, { name: '验证', planDate: DD(4) }],
      relatedProblemIds: [],
      timeline: [{ at: D(0, 9, 0), actor: '孙立', action: '由变更单派发任务' }]
    },
    {
      id: 't08', no: 'RW20260123008', title: '可视化指标 API 封装', type: '服务封装',
      source: 'DEMAND', sourceId: 'd13', sourceNo: 'XQ20260122013',
      dept: '数据生产中心 · 加工组', assignee: '刘涛', priority: 'P1',
      planStart: DD(-3), planEnd: DD(-1), progress: 100, status: 'PENDING_VERIFY',
      content: '封装医疗资源指标与慢病标签汇总查询 API，供京智三医联动可视化调用。',
      deliverable: 'API 服务（组合查询）配置 + 接口文档',
      resources: ['r013', 'r014'],
      milestones: [{ name: 'API 配置', planDate: DD(-2), doneDate: DD(-2) }, { name: '联调', planDate: DD(-1), doneDate: DD(-1) }],
      relatedProblemIds: [],
      timeline: [
        { at: D(-3, 15, 0), actor: '王思远', action: '派发任务' },
        { at: D(-1, 10, 0), actor: '刘涛', action: '提交验证' }
      ]
    },
    {
      id: 't09', no: 'RW20260125009', title: '门急诊就诊记录延迟整改-采集批次完整性校验', type: '数据加工',
      source: 'PROBLEM', sourceId: 'p01', sourceNo: 'WT2026010001',
      dept: '数据生产中心 · 加工组', assignee: '何静', priority: 'P1',
      planStart: DD(1), planEnd: DD(8), progress: 0, status: 'PENDING_ACCEPT',
      content: '根据问题单 WT2026010001 的根因结论，新增上游采集批次完整性校验机制，批次缺失时自动告警并触发补采。',
      deliverable: '批次完整性校验作业 + 告警规则配置',
      resources: ['r003'],
      milestones: [{ name: '方案设计', planDate: DD(2) }, { name: '开发', planDate: DD(5) }, { name: '验证', planDate: DD(8) }],
      relatedProblemIds: ['p01'],
      timeline: [{ at: D(-1, 17, 0), actor: '陈志刚', action: '由问题单创建任务单', comment: '作为根因整改措施' }]
    },
    {
      id: 't10', no: 'RW20260115010', title: '医保结算数据文件分包压缩配置', type: '服务封装',
      source: 'DEMAND', sourceId: 'd01', sourceNo: 'XQ20260112001',
      dept: '数据生产中心 · 加工组', assignee: '刘涛', priority: 'P2',
      planStart: DD(-9), planEnd: DD(-6), progress: 100, status: 'DONE', verifyResult: '通过',
      content: '为医保结算增量文件服务配置分包压缩与 SFTP 下发参数。',
      deliverable: '文件服务下发配置（分包 100MB，SFTP）',
      resources: ['r007'],
      milestones: [{ name: '配置', planDate: DD(-7), doneDate: DD(-7) }, { name: '联调', planDate: DD(-6), doneDate: DD(-6) }],
      relatedProblemIds: [],
      timeline: [{ at: D(-9, 10, 0), actor: '王思远', action: '派发任务' }, { at: D(-6, 16, 0), actor: '赵敏', action: '验证通过' }]
    },
    {
      id: 't11', no: 'RW20260127011', title: '传染病推送频率调整实施（变更实施）', type: '数据加工',
      source: 'MANUAL', sourceId: 'c05', sourceNo: 'BG20260127005',
      dept: '数据生产中心 · 加工组', assignee: '刘涛', priority: 'P1',
      planStart: DD(3), planEnd: DD(3), progress: 0, status: 'PENDING_DISPATCH',
      content: '按变更单 BG20260127005 调整传染病报告实时推送频率至 1 分钟，并完成容量评估。',
      deliverable: 'Flink 作业参数调整 + 容量评估报告',
      resources: ['r010'],
      milestones: [{ name: '容量评估', planDate: DD(2) }, { name: '参数调整', planDate: DD(3) }],
      relatedProblemIds: [],
      timeline: [{ at: D(0, 9, 0), actor: '郑晓', action: '创建任务单', comment: '待派发至生产部门' }]
    },
    {
      id: 't12', no: 'RW20260120012', title: '药品字典贯标验证（退回重做）', type: '数据加工',
      source: 'DEMAND', sourceId: 'd02', sourceNo: 'XQ20260116002',
      dept: '数据生产中心 · 加工组', assignee: '何静', priority: 'P3',
      planStart: DD(-6), planEnd: DD(-4), progress: 40, status: 'REJECTED', verifyResult: '不通过',
      rejectReason: '贯标结果中 186 条药品的名称与批准文号不匹配，需核对原始数据后重新贯标。',
      content: '药品字典贯标结果验证。',
      deliverable: '贯标结果表',
      resources: ['r005'],
      milestones: [{ name: '贯标', planDate: DD(-5), doneDate: DD(-5) }, { name: '验证', planDate: DD(-4) }],
      relatedProblemIds: [],
      timeline: [
        { at: D(-6, 10, 0), actor: '王思远', action: '派发任务' },
        { at: D(-4, 15, 0), actor: '张建国', action: '验证不通过', comment: '186 条名称与批准文号不匹配，退回重做' }
      ]
    }
  ];
}

function buildSubscriptions(): any[] {
  return [
    {
      id: 'sb01', no: 'DY20260114001', demandNo: 'XQ20260112001', kind: 'API', serviceId: 'sv03', appId: 'app01', tenantId: 't01',
      apiConf: { period: '12 个月', estCalls: 50000 },
      approveStatus: 'APPROVED', submittedAt: D(-9, 15, 0), approvedAt: D(-9, 16, 0), approver: '张建国',
      channelAuth: { useScope: ['市医疗保障局', '医保基金监管分析平台'], visibleScope: ['市医疗保障局'] },
      secret: { appKey: 'AK20260114EI8X2M', appSecret: 'SK******************7f3c', issuedAt: D(-9, 16, 0) },
      pushLogs: [
        { at: D(-9, 17, 0), target: '医保基金监管分析平台', mode: '授权', transport: '库表', rows: 0, status: '成功', note: 'API 授权生效' },
        { at: D(-1, 2, 0), target: '医保基金监管分析平台', mode: '数据推送', transport: 'Flink', rows: 186420, status: '成功', note: '每日增量推送' }
      ]
    },
    {
      id: 'sb02', no: 'DY20260122002', demandNo: 'XQ20260119003', kind: 'FILE', serviceId: 'sv08', appId: 'app06', tenantId: 't03',
      fileConf: { taskName: '医疗资源指标日度下发', filePath: '/data/metric/medical_resource/', fileName: 'metric_medical_resource_{yyyyMMdd}.csv', separator: '|', format: 'CSV(UTF-8 BOM)', zip: true, fields: ['metric_code', 'metric_name', 'stat_period', 'metric_value', 'district'], rule: '按 stat_date = T-1 全量取数', schedule: '每日 03:00' },
      approveStatus: 'APPROVED', submittedAt: D(-2, 9, 0), approvedAt: D(-2, 10, 0), approver: '孙立',
      channelAuth: { useScope: ['市卫生健康委员会', '三医一张图可视化'], visibleScope: ['市卫生健康委员会'] },
      pushLogs: [
        { at: D(-2, 3, 0), target: '三医一张图可视化', mode: '数据推送', transport: '库表', rows: 86400, status: '成功', note: '全量下发' },
        { at: D(-1, 3, 0), target: '三医一张图可视化', mode: '数据推送', transport: '库表', rows: 86400, status: '成功', note: '全量下发' },
        { at: D(0, 3, 0), target: '三医一张图可视化', mode: '数据推送', transport: '库表', rows: 86400, status: '失败', note: '目标路径磁盘空间不足，已触发预警并安排补推' }
      ]
    },
    {
      id: 'sb03', no: 'DY20260117003', demandNo: 'XQ20260112001', kind: 'API', serviceId: 'sv04', appId: 'app02', tenantId: 't01',
      apiConf: { period: '12 个月', estCalls: 30000 },
      approveStatus: 'APPROVED', submittedAt: D(-6, 13, 0), approvedAt: D(-6, 14, 0), approver: '张建国',
      channelAuth: { useScope: ['市医疗保障局', '医保参保画像应用'], visibleScope: ['市医疗保障局'] },
      secret: { appKey: 'AK20260117QW3N9K', appSecret: 'SK******************2b81', issuedAt: D(-6, 14, 0), reissued: false },
      pushLogs: [{ at: D(-6, 15, 0), target: '医保参保画像应用', mode: '授权', transport: '库表', rows: 0, status: '成功' }]
    },
    {
      id: 'sb04', no: 'DY20260126004', demandNo: 'XQ20260121004', kind: 'REALTIME', serviceId: 'sv11', appId: 'app08', tenantId: 't04',
      rtConf: { mode: '推送', cluster: 'kafka-prod-03:9092', auth: 'SASL/SCRAM-SHA-256', authType: '密钥认证' },
      approveStatus: 'PENDING', submittedAt: D(-1, 16, 0),
      channelAuth: null, pushLogs: []
    },
    {
      id: 'sb05', no: 'DY20260125005', demandNo: 'XQ20260118005', kind: 'FILE', serviceId: 'sv09', appId: 'app03', tenantId: 't01',
      fileConf: { taskName: '医保结算增量下发', filePath: '/sftp/mi/settlement/', fileName: 'mi_settlement_incr_{yyyyMMdd}.csv.gz', separator: '|', format: 'CSV(GBK)', zip: true, fields: ['settle_no', 'insured_id', 'settle_date', 'total_fee', 'fund_pay'], rule: '按 settle_date = T-1 增量取数', schedule: '每日 04:00' },
      approveStatus: 'PENDING', submittedAt: D(-2, 10, 0),
      channelAuth: null, pushLogs: []
    },
    {
      id: 'sb06', no: 'DY20260120006', demandNo: 'XQ20260119003', kind: 'API', serviceId: 'sv01', appId: 'app07', tenantId: 't03',
      apiConf: { period: '长期', estCalls: 20000 },
      approveStatus: 'APPROVED', submittedAt: D(-3, 9, 0), approvedAt: D(-3, 10, 0), approver: '孙立',
      channelAuth: { useScope: ['市卫生健康委员会'], visibleScope: ['市卫生健康委员会', '市医疗保障局', '市药品监督管理局'] },
      secret: { appKey: 'AK20260120ZX7P4L', appSecret: 'SK******************9c15', issuedAt: D(-3, 10, 0) },
      pushLogs: [{ at: D(-3, 11, 0), target: '医疗资源专题分析', mode: '授权', transport: '库表', rows: 0, status: '成功' }]
    },
    {
      id: 'sb07', no: 'DY20260108007', demandNo: 'XQ20260112001', kind: 'REALTIME', serviceId: 'sv10', appId: 'app06', tenantId: 't03',
      rtConf: { mode: '消费', cluster: 'kafka-prod-03:9092', auth: 'SASL/SCRAM-SHA-256', authType: '密钥认证' },
      approveStatus: 'UNSUBSCRIBED', submittedAt: D(-19, 14, 0), approvedAt: D(-18, 9, 0), approver: '张建国',
      unsubscribedAt: D(-12, 10, 0),
      channelAuth: { useScope: ['市卫生健康委员会'], visibleScope: ['市卫生健康委员会'] },
      secret: { appKey: 'AK20260108MM2R6T', appSecret: 'SK******************4d72', issuedAt: D(-18, 9, 0), reissued: true },
      pushLogs: [{ at: D(-17, 2, 0), target: '三医一张图可视化', mode: '数据推送', transport: 'Flink', rows: 426800, status: '成功' }]
    },
    {
      id: 'sb08', no: 'DY20260127008', demandNo: 'XQ20260122013', kind: 'API', serviceId: 'sv02', appId: 'app06', tenantId: 't03',
      apiConf: { period: '长期', estCalls: 100000 },
      approveStatus: 'PENDING', submittedAt: D(0, 10, 0),
      channelAuth: null, pushLogs: []
    },
    {
      id: 'sb09', no: 'DY20260121009', demandNo: 'XQ20260118005', kind: 'API', serviceId: 'sv05', appId: 'app04', tenantId: 't02',
      apiConf: { period: '24 个月', estCalls: 8000 },
      approveStatus: 'APPROVED', submittedAt: D(-4, 15, 0), approvedAt: D(-4, 16, 0), approver: '张建国',
      channelAuth: { useScope: ['市药品监督管理局'], visibleScope: ['市药品监督管理局'] },
      secret: { appKey: 'AK20260121HH5V8D', appSecret: 'SK******************6a29', issuedAt: D(-4, 16, 0) },
      pushLogs: [{ at: D(-4, 17, 0), target: '药品不良反应监测', mode: '授权', transport: '库表', rows: 0, status: '成功' }]
    },
    {
      id: 'sb10', no: 'DY20260110010', demandNo: 'XQ20260112001', kind: 'API', serviceId: 'sv06', appId: 'app01', tenantId: 't01',
      apiConf: { period: '6 个月', estCalls: 2000 },
      approveStatus: 'REJECTED', submittedAt: D(-17, 11, 0), rejectedAt: D(-16, 10, 0), rejectReason: '该服务因安全评估已停用，暂不接受新的订阅申请。',
      channelAuth: null, pushLogs: []
    }
  ];
}

function buildTenantRegs(): any[] {
  return [
    { id: 'tn01', no: 'ZH20260120001', type: '企业', name: '市疾控中心监测租户', fields: { 公司类型: '事业单位', 租户性质: '数据使用方', 公司名称: '市疾病预防控制中心', 营业编码: '12110000********XW', 所属区域: '北京市', 详细地址: '北京市东城区**街**号', 职位: '信息科科长', 公司文件: '事业单位法人证书.pdf', 联系人: '郑晓', 手机号: '138****1010', 邮箱: 'zhengx@cdc.beijing.gov.cn' }, status: 'APPROVED', reviewer: '赵敏', reviewedAt: D(-150, 11, 0), reviewComment: '资质材料齐全，同意开通' },
    { id: 'tn02', no: 'ZH20260123002', type: '企业', name: '市应急管理局指挥租户', fields: { 公司类型: '机关单位', 租户性质: '数据使用方', 公司名称: '市应急管理局', 营业编码: '11110000********JT', 所属区域: '北京市', 详细地址: '北京市西城区**大街**号', 职位: '应急指挥专员', 公司文件: '单位介绍信.pdf', 联系人: '黄伟', 手机号: '138****1011', 邮箱: 'huangw@yjgl.beijing.gov.cn' }, status: 'APPROVED', reviewer: '赵敏', reviewedAt: D(-90, 16, 0), reviewComment: '同意开通，限定应急场景使用' },
    { id: 'tn03', no: 'ZH20260126003', type: '个人', name: '个人开发者账号申请（李慧敏）', fields: { 姓名: '李慧敏', 手机号: '138****1001', 身份证: '1101**********1001', 邮箱: 'lihm@ybj.beijing.gov.cn', 用户名: 'lihm_ybj', 申请说明: '因医保基金监管分析平台联调需要，申请个人测试账号' }, status: 'PENDING', submittedAt: D(-1, 10, 0) },
    { id: 'tn04', no: 'ZH20260127004', type: '企业', name: '某医疗科技有限公司租户申请', fields: { 公司类型: '有限责任公司', 租户性质: '数据开发利用方', 公司名称: '北京**医疗科技有限公司', 营业编码: '91110108MA********', 所属区域: '北京市海淀区', 详细地址: '北京市海淀区**路**号**层', 职位: '数据总监', 公司文件: '营业执照.pdf、数据安全承诺书.pdf', 联系人: '**', 手机号: '139****2233', 邮箱: 'contact@medtech-partner.cn' }, status: 'PENDING', submittedAt: D(0, 9, 0) },
    { id: 'tn05', no: 'ZH20260118005', type: '企业', name: '某健康管理公司租户申请', fields: { 公司类型: '有限责任公司', 租户性质: '数据开发利用方', 公司名称: '北京**健康管理有限公司', 营业编码: '91110105MA********', 所属区域: '北京市朝阳区', 详细地址: '北京市朝阳区**路**号', 职位: '运营负责人', 公司文件: '营业执照.pdf', 联系人: '**', 手机号: '137****4455', 邮箱: 'ops@health-partner.cn' }, status: 'REJECTED', reviewer: '赵敏', reviewedAt: D(-40, 14, 0), reviewComment: '申请能力类型与业务场景不匹配，且未提供数据安全承诺书，请补充材料后重新提交。' }
  ];
}

function buildCapabilityApplies(): any[] {
  return [
    { id: 'ca01', no: 'NL20260120001', applicant: '郑晓', email: 'zhengx@cdc.beijing.gov.cn', phone: '13800001010', applyType: '计算能力', storage: '2 TB', cpu: '64 核', memory: '256 GB', tenantId: 't04', status: 'APPROVED', submittedAt: D(-20, 10, 0), reviewedAt: D(-19, 9, 0), reviewer: '赵敏' },
    { id: 'ca02', no: 'NL20260124002', applicant: '黄伟', email: 'huangw@yjgl.beijing.gov.cn', phone: '13800001011', applyType: '数据服务能力', storage: '500 GB', cpu: '16 核', memory: '64 GB', tenantId: 't05', status: 'APPROVED', submittedAt: D(-4, 14, 0), reviewedAt: D(-3, 10, 0), reviewer: '赵敏' },
    { id: 'ca03', no: 'NL20260127003', applicant: '李慧敏', email: 'lihm@ybj.beijing.gov.cn', phone: '13800001001', applyType: '数据库能力', storage: '1 TB', cpu: '32 核', memory: '128 GB', tenantId: 't01', status: 'PENDING', submittedAt: D(-1, 15, 0) },
    { id: 'ca04', no: 'NL20260127004', applicant: '马超', email: 'mach@pku3h.org.cn', phone: '13800001015', applyType: '应用能力', storage: '200 GB', cpu: '8 核', memory: '32 GB', tenantId: 't03', status: 'PENDING', submittedAt: D(0, 10, 0) }
  ];
}

function buildSecurityApprovals(): any[] {
  return [
    {
      id: 'sa01', demandId: 'd04', demandNo: 'XQ20260121004', cate: '临时授权工单', createdAt: D(-4, 15, 0),
      levels: [
        { level: 1, approver: '周雅静', channel: '系统审批', status: '通过', comment: '公共卫生监测场景，同意按 L3 掩码授权', at: D(-4, 15, 0) },
        { level: 2, approver: '孙立', channel: '邮件审批', status: '通过', comment: '邮件回复同意（2026-01-23 16:12）', at: D(-4, 16, 0) }
      ]
    },
    {
      id: 'sa02', demandId: 'd01', demandNo: 'XQ20260112001', cate: '临时授权工单', createdAt: D(-13, 9, 0),
      levels: [
        { level: 1, approver: '周雅静', channel: '系统审批', status: '通过', comment: '监管场景必要，同意按 L3 掩码授权，限定市医保局使用', at: D(-13, 10, 0) }
      ]
    },
    {
      id: 'sa03', demandId: 'd07', demandNo: 'XQ20260125007', cate: '临时授权工单', createdAt: D(-1, 15, 0),
      levels: [
        { level: 1, approver: '周雅静', channel: '系统审批', status: '待审批' },
        { level: 2, approver: '孙立', channel: '邮件审批', status: '待审批' }
      ]
    }
  ];
}

/* ==================================================== 事件 / 问题 -- */
function buildIncidents(): any[] {
  const base = [
    {
      id: 'i01', no: 'SJ20260125001', title: '【接口异常】医疗机构信息查询服务返回 403', description: '医保基金监管分析平台调用医疗机构信息查询服务时返回 403 Forbidden，请求参数正常，昨日可正常调用。',
      source: '微信报障', categoryId: 'ic01', categoryName: '数据服务接口异常',
      severity: '高', impact: '部分功能受影响', urgency: '紧急', priority: 'P1',
      ciIds: ['ci07'], status: 'RESOLVED', handler: '徐鹏', handlerGroup: '运维中心 · 一线支持组',
      slaDueAt: D(-1, 12, 0), resolvedAt: D(-1, 11, 0), closeType: null,
      relatedIncidentIds: [], problemId: null, changeId: null, broadcastIds: [], knowledgeRefs: ['k01'],
      timeline: [
        { at: D(-1, 9, 0), actor: '李慧敏', action: '通过微信报障提交事件' },
        { at: D(-1, 9, 0), actor: '系统', action: '按分类自动分派至运维中心 · 一线支持组' },
        { at: D(-1, 9, 0), actor: '系统', action: '知识库匹配到 1 条相关条目', comment: '《API 服务鉴权失败（401/403）排查清单》' },
        { at: D(-1, 10, 0), actor: '徐鹏', action: '受理并开始处理', comment: '按知识条目 k01 排查' },
        { at: D(-1, 11, 0), actor: '徐鹏', action: '解决', comment: '原因为密钥更换后调用方未同步，已协助更新 appSecret 并验证通过' }
      ]
    },
    {
      id: 'i02', no: 'SJ20260125002', title: '【数据延迟】门急诊就诊记录未按时更新', description: '门急诊就诊明细查询服务返回的最近数据日期停留在 2026-01-24，T+1 数据未按时更新，影响基金监管分析。',
      source: '服务台申报', categoryId: 'ic02', categoryName: '数据更新延迟',
      severity: '严重', impact: '严重影响业务', urgency: '紧急', priority: 'P0',
      ciIds: ['ci05', 'ci08'], status: 'ESCALATED', handler: '陈志刚', handlerGroup: '运维中心 · 二线支持组',
      slaDueAt: D(0, 12, 0),
      relatedIncidentIds: ['i05'], problemId: 'p01', changeId: null, broadcastIds: ['gb01'], knowledgeRefs: ['k02', 'k08'],
      timeline: [
        { at: D(-2, 8, 0), actor: '王思远', action: '服务台申报事件', comment: '医保局反馈数据未更新' },
        { at: D(-2, 8, 0), actor: '系统', action: '按分类自动分派至数据生产中心 · 加工组' },
        { at: D(-2, 9, 0), actor: '刘涛', action: '初步排查', comment: '作业调度正常，疑似上游采集批次缺失' },
        { at: D(-1, 11, 0), actor: '徐鹏', action: '升级', comment: '一线无法定位，升级至二线支持组' },
        { at: D(-1, 14, 0), actor: '陈志刚', action: '关联重复事件', comment: '与 SJ20260124003 为同类问题，已关联' },
        { at: D(-1, 15, 0), actor: '陈志刚', action: '开出问题单', comment: '生成问题单 WT2026010001 做根因分析' },
        { at: D(-1, 16, 0), actor: '陈志刚', action: '事件广播', comment: '已向全部订阅方通告事件进展' }
      ]
    },
    {
      id: 'i03', no: 'SJ20260126003', title: '【功能异常】需求单详情页流转状态未刷新', description: '需求单审批通过后，详情页顶部流转状态条仍显示「待审批」，刷新页面后恢复正常。',
      source: '客户自助', categoryId: 'ic04', categoryName: '平台功能不可用',
      severity: '中', impact: '轻微影响', urgency: '一般', priority: 'P2',
      ciIds: [], status: 'PROCESSING', handler: '徐鹏', handlerGroup: '运维中心 · 一线支持组',
      slaDueAt: D(1, 10, 0),
      relatedIncidentIds: [], problemId: null, changeId: null, broadcastIds: [], knowledgeRefs: [],
      timeline: [
        { at: D(-1, 15, 0), actor: '吴强', action: '通过自助服务提交事件' },
        { at: D(-1, 15, 0), actor: '系统', action: '按分类自动分派至运维中心 · 一线支持组' },
        { at: D(0, 9, 0), actor: '徐鹏', action: '开始处理', comment: '初步判断为前端状态缓存问题，正在复现' }
      ]
    },
    {
      id: 'i04', no: 'SJ20260124003', title: '【数据延迟】门急诊就诊记录更新延迟（同类）', description: '门急诊就诊记录更新延迟，与 SJ20260125002 表现一致。',
      source: '服务台申报', categoryId: 'ic02', categoryName: '数据更新延迟',
      severity: '高', impact: '部分功能受影响', urgency: '紧急', priority: 'P1',
      ciIds: ['ci05'], status: 'CLOSED', handler: '陈志刚', handlerGroup: '运维中心 · 二线支持组',
      slaDueAt: D(-2, 18, 0), resolvedAt: D(-2, 17, 0), closeType: '二线解决',
      relatedIncidentIds: ['i02'], problemId: null, changeId: null, broadcastIds: [], knowledgeRefs: ['k02'],
      timeline: [
        { at: D(-3, 9, 0), actor: '王思远', action: '服务台申报事件' },
        { at: D(-2, 17, 0), actor: '陈志刚', action: '解决并关闭', comment: '临时手工补采后恢复，已关联至 SJ20260125002 统一处理' }
      ]
    },
    {
      id: 'i05', no: 'SJ20260126004', title: '【性能问题】医保结算信息查询服务响应超过 10 秒', description: '查询 2025 年全年结算数据时响应时间超过 10 秒，出现超时。',
      source: '服务台申报', categoryId: 'ic05', categoryName: '性能问题',
      severity: '中', impact: '部分功能受影响', urgency: '较急', priority: 'P2',
      ciIds: ['ci09', 'ci02'], status: 'DISPATCHED', handler: '陈志刚', handlerGroup: '运维中心 · 二线支持组',
      slaDueAt: D(0, 18, 0),
      relatedIncidentIds: [], problemId: null, changeId: null, broadcastIds: [], knowledgeRefs: [],
      timeline: [
        { at: D(0, 8, 0), actor: '李慧敏', action: '服务台申报事件' },
        { at: D(0, 8, 0), actor: '系统', action: '按分类自动分派至运维中心 · 二线支持组' }
      ]
    },
    {
      id: 'i06', no: 'SJ20260127005', title: '【数据安全】疑似越权访问 L4 资源', description: '安全网关告警：某应用尝试访问医保参保人员信息（L4）中未授权字段。',
      source: '服务台申报', categoryId: 'ic07', categoryName: '数据安全事件',
      severity: '严重', impact: '严重影响业务', urgency: '紧急', priority: 'P0',
      ciIds: ['ci06', 'ci15'], status: 'NEW', handler: '—', handlerGroup: '安全与合规管理处',
      slaDueAt: D(0, 12, 0),
      relatedIncidentIds: [], problemId: null, changeId: null, broadcastIds: [], knowledgeRefs: ['k05'],
      timeline: [
        { at: D(0, 9, 0), actor: '安全网关', action: '自动创建事件', comment: '命中越权访问规则，涉及 L4 资源字段' }
      ]
    },
    {
      id: 'i07', no: 'SJ20260127006', title: '【权限问题】新入职人员无法登录平台', description: '市药监局新入职人员账号已创建但无法登录，提示权限不足。',
      source: '邮件', categoryId: 'ic06', categoryName: '权限与账号问题',
      severity: '低', impact: '轻微影响', urgency: '一般', priority: 'P3',
      ciIds: [], status: 'NEW', handler: '—', handlerGroup: '平台运营中心',
      slaDueAt: D(1, 10, 0),
      relatedIncidentIds: [], problemId: null, changeId: null, broadcastIds: [], knowledgeRefs: ['k07'],
      timeline: [{ at: D(0, 8, 0), actor: '吴强', action: '通过邮件提交事件（服务台邮箱自动建单）' }]
    }
  ];
  /* 批量补充历史事件，用于统计图表 */
  const extra = [];
  const titles = [
    '【接口异常】文件服务下载链接失效', '【数据延迟】药品字典周更新未完成', '【功能异常】资源目录检索结果为空',
    '【接口异常】实时推送服务连接中断', '【数据缺失】体检结果字段为空', '【性能问题】三医一张图加载缓慢',
    '【权限问题】密钥补发申请未生效', '【数据缺失】传染病报告单位名称为空', '【接口异常】服务编排API 返回 500',
    '【功能异常】工作流部署日志不显示', '【数据延迟】血液供应数据延迟 2 天', '【权限问题】租户管理员看不到应用列表'
  ];
  const statuses = ['CLOSED', 'CLOSED', 'CLOSED', 'CLOSED', 'CLOSED', 'RESOLVED', 'CLOSED', 'RESOLVED', 'CLOSED', 'CLOSED', 'RESOLVED', 'CLOSED'];
  const catIds = ['ic01', 'ic02', 'ic04', 'ic01', 'ic03', 'ic05', 'ic06', 'ic03', 'ic01', 'ic04', 'ic02', 'ic06'];
  const sevs = ['中', '中', '低', '高', '中', '低', '低', '中', '高', '低', '中', '低'];
  const imps = ['部分功能受影响', '轻微影响', '轻微影响', '部分功能受影响', '轻微影响', '轻微影响', '轻微影响', '部分功能受影响', '部分功能受影响', '轻微影响', '部分功能受影响', '轻微影响'];
  const urg = ['较急', '一般', '一般', '紧急', '一般', '一般', '一般', '较急', '紧急', '一般', '较急', '一般'];
  const srcs = ['服务台申报', '客户自助', '微信报障', '服务台申报', '客户自助', '服务台申报', '邮件', '服务台申报', '客户自助', '微信报障', '服务台申报', '邮件'];
  const handlers = ['徐鹏', '陈志刚', '徐鹏', '陈志刚', '徐鹏', '陈志刚', '徐鹏', '陈志刚', '徐鹏', '陈志刚', '徐鹏', '徐鹏'];
  const groups = ['运维中心 · 一线支持组', '运维中心 · 二线支持组', '运维中心 · 一线支持组', '运维中心 · 二线支持组', '运维中心 · 一线支持组', '运维中心 · 二线支持组', '运维中心 · 一线支持组', '运维中心 · 二线支持组', '运维中心 · 一线支持组', '运维中心 · 二线支持组', '运维中心 · 一线支持组', '运维中心 · 一线支持组'];
  const closeTypes = ['一线解决', '二线解决', '用户确认关闭', '二线解决', '一线解决', '自动关闭', '一线解决', '用户确认关闭', '二线解决', '自动关闭', '二线解决', '一线解决'];
  for (let i = 0; i < 18; i++) {
    const t = i % titles.length;
    const dayOff = -(3 + i);
    const cat = U_find(INCIDENT_CATEGORIES, catIds[t]);
    extra.push({
      id: 'ix' + (i + 1), no: seq('SJ202601', 20 + i, 27 + dayOff > 0 ? 27 + dayOff : (27 + dayOff + 31)),
      title: titles[t], description: titles[t].replace(/^【[^】]+】/, '') + '，需要运维协助处理。',
      source: srcs[t], categoryId: catIds[t], categoryName: cat ? cat.name : '其他',
      severity: sevs[t], impact: imps[t], urgency: urg[t],
      priority: imps[t] === '严重影响业务' ? 'P0' : imps[t] === '部分功能受影响' ? (urg[t] === '紧急' ? 'P1' : 'P2') : 'P3',
      ciIds: [], status: statuses[t], handler: handlers[t], handlerGroup: groups[t],
      slaDueAt: D(dayOff + 1, 12, 0), resolvedAt: statuses[t] === 'CLOSED' || statuses[t] === 'RESOLVED' ? D(dayOff, 16, 0) : null,
      closeType: statuses[t] === 'CLOSED' ? closeTypes[t] : null,
      relatedIncidentIds: [], problemId: null, changeId: null, broadcastIds: [], knowledgeRefs: [],
      timeline: [
        { at: D(dayOff, 9, 0), actor: srcs[t] === '邮件' ? '服务台邮箱' : '用户', action: '提交事件' },
        { at: D(dayOff, 10, 0), actor: handlers[t], action: '受理并处理' },
        { at: D(dayOff, 16, 0), actor: handlers[t], action: statuses[t] === 'CLOSED' ? '解决并关闭' : '解决' }
      ]
    });
  }
  /* 近 7 天按小时分布的事件，用于按小时统计 */
  const hourlyExtra = [];
  for (let hi = 0; hi < 24; hi++) {
    const c = [3, 1, 1, 0, 0, 1, 2, 6, 14, 22, 26, 18, 12, 16, 24, 28, 22, 16, 10, 8, 6, 5, 4, 3][hi];
    for (let k = 0; k < c; k++) {
      hourlyExtra.push({
        id: 'ih' + hi + '_' + k, no: 'SJ2026H' + (hi < 10 ? '0' + hi : hi) + String(k).padStart(3, '0'),
        title: '【历史】' + (hi < 12 ? '上午' : '下午') + hi + '时事件记录',
        description: '按小时汇总的历史事件记录。', source: pick(srcs, hi + k),
        categoryId: pick(catIds, hi + k), categoryName: (U_find(INCIDENT_CATEGORIES, pick(catIds, hi + k)) || {}).name || '其他',
        severity: pick(sevs, hi + k), impact: pick(imps, hi + k), urgency: pick(urg, hi + k),
        priority: pick(['P1', 'P2', 'P3'], hi + k),
        ciIds: [], status: 'CLOSED',
        handler: pick(handlers, hi + k), handlerGroup: pick(groups, hi + k),
        slaDueAt: D(-6 + Math.floor(hi / 4), hi, 0), resolvedAt: D(-6 + Math.floor(hi / 4), (hi + 2) % 24, 0),
        closeType: pick(closeTypes, hi + k),
        relatedIncidentIds: [], problemId: null, changeId: null, broadcastIds: [], knowledgeRefs: [],
        timeline: [{ at: D(-6 + Math.floor(hi / 4), hi, 0), actor: pick(handlers, hi + k), action: '处理完成' }],
        __hour: hi, __dayOffset: -6 + Math.floor(hi / 4)
      });
    }
  }
  return (base as any[]).concat(extra, hourlyExtra)
}
function U_find<T extends { id: string }>(arr: T[], id: string): T | null {
  for (let i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i]
  return null
}

function buildProblems(): any[] {
  return [
    {
      id: 'p01', no: 'WT2026010001', title: '门急诊就诊记录批量延迟（根因：上游采集批次缺失）',
      source: 'INCIDENT', sourceIncidentIds: ['i02', 'i04'],
      severity: '严重', impact: '严重影响业务', urgency: '紧急', priority: 'P0',
      status: 'KNOWN_ERROR', handler: '陈志刚', dept: '运维中心 · 二线支持组',
      rootCause: '上游 3 家医院的 LIS 系统在 01-23 夜间批量升级，导致当日采集批次未完整上报；现有调度未对批次完整性做校验，缺失后无告警，直接进入加工环节。',
      knownError: { workaround: '发现延迟后，由数据生产中心手工触发补采并重跑加工作业，可在 4 小时内恢复数据可用性。', permanentFixPlan: '推进上游采集链路改造，新增批次完整性校验与缺失自动补采能力（由任务单 RW20260125009 承接）。', expireAt: DD(40) },
      solution: '', preventive: '在上游系统变更（升级、割接）前，需通过变更管理流程提前报备并通知数据生产中心，避免批次缺失。',
      notifyChannels: ['邮件', '短信'],
      notifyLogs: [
        { at: D(-1, 15, 0), to: '李慧敏（市医疗保障局）', channel: '邮件', content: '问题单 WT2026010001 已创建，根因分析中，预计 24 小时内给出结论。' },
        { at: D(-1, 16, 0), to: '王思远（服务台）', channel: '短信', content: '【三医数据底座】问题 WT2026010001 已给出临时解决方案，请同步订阅方。' }
      ],
      relatedChangeIds: [], relatedCiIds: ['ci05', 'ci03'], knowledgeId: 'k02',
      createdAt: D(-1, 15, 0), expectAt: DD(10),
      timeline: [
        { at: D(-1, 15, 0), actor: '陈志刚', action: '由事件单 SJ20260125002 创建问题单' },
        { at: D(-1, 15, 0), actor: '陈志刚', action: '分派至运维中心 · 二线支持组' },
        { at: D(-1, 16, 0), actor: '陈志刚', action: '根因分析完成', comment: '根因：上游采集批次缺失，现有调度无批次完整性校验' },
        { at: D(-1, 16, 0), actor: '陈志刚', action: '转入已知错误流程', comment: '根治需上游改造，先提供临时解决方案' },
        { at: D(-1, 17, 0), actor: '陈志刚', action: '提交知识条目', comment: '已更新知识条目《数据更新延迟（T+1 未到数）处理规范》' },
        { at: D(-1, 17, 0), actor: '陈志刚', action: '创建任务单', comment: '生成任务单 RW20260125009 承接根因整改' }
      ]
    },
    {
      id: 'p02', no: 'WT2026010002', title: '资源目录检索结果偶发为空（全文检索索引同步问题）',
      source: 'MANUAL', sourceIncidentIds: ['i03'],
      severity: '中', impact: '轻微影响', urgency: '一般', priority: 'P2',
      status: 'ANALYZING', handler: '陈志刚', dept: '运维中心 · 二线支持组',
      rootCause: '',
      notifyChannels: ['邮件'],
      notifyLogs: [{ at: D(-1, 17, 0), to: '吴强（市药品监督管理局）', channel: '邮件', content: '问题单 WT2026010002 已受理，正在分析中。' }],
      relatedChangeIds: [], relatedCiIds: [], knowledgeId: null,
      createdAt: D(-1, 17, 0), expectAt: DD(6),
      timeline: [
        { at: D(-1, 17, 0), actor: '陈志刚', action: '手工创建问题单', comment: '同类反馈已出现 3 次，转为问题深入分析' },
        { at: D(0, 9, 0), actor: '陈志刚', action: '分析中', comment: '怀疑为全文检索索引与元数据同步存在时间差，正在验证' }
      ]
    },
    {
      id: 'p03', no: 'WT2026010003', title: '实时推送服务在大批量场景下消息堆积',
      source: 'MANUAL', sourceIncidentIds: [],
      severity: '高', impact: '部分功能受影响', urgency: '较急', priority: 'P1',
      status: 'DISPATCHED', handler: '陈志刚', dept: '运维中心 · 二线支持组',
      rootCause: '', notifyChannels: ['邮件', '短信'],
      notifyLogs: [], relatedChangeIds: [], relatedCiIds: ['ci16', 'ci11'], knowledgeId: null,
      createdAt: D(0, 8, 0), expectAt: DD(8),
      timeline: [{ at: D(0, 8, 0), actor: '陈志刚', action: '创建问题单并分派' }]
    },
    {
      id: 'p04', no: 'WT2026010004', title: '药品字典贯标结果名称与批准文号不匹配',
      source: 'MANUAL', sourceIncidentIds: [],
      severity: '中', impact: '部分功能受影响', urgency: '一般', priority: 'P2',
      status: 'RESOLVED', handler: '刘涛', dept: '数据生产中心 · 加工组',
      rootCause: '上游药品字典存在历史遗留的编码复用问题，同一 drug_code 对应多个批准文号，贯标时按编码匹配导致名称错配。',
      solution: '按「编码 + 批准文号」组合键重新匹配，并对历史数据做一次全量校验；已重新贯标并通过验证。',
      preventive: '在贯标作业中增加唯一性校验规则，对编码复用情况输出异常清单并要求上游确认。',
      notifyChannels: ['邮件'],
      notifyLogs: [{ at: D(-3, 16, 0), to: '吴强（市药品监督管理局）', channel: '邮件', content: '问题 WT2026010004 已解决，贯标结果已重新校验。' }],
      relatedChangeIds: [], relatedCiIds: [], knowledgeId: null,
      createdAt: D(-5, 10, 0), expectAt: DD(-1), resolvedAt: D(-3, 15, 0),
      timeline: [
        { at: D(-5, 10, 0), actor: '刘涛', action: '创建问题单', comment: '任务单 RW20260120012 验证不通过后转入' },
        { at: D(-3, 15, 0), actor: '刘涛', action: '解决', comment: '按编码+批准文号组合键重新匹配并重新贯标' }
      ]
    },
    {
      id: 'p05', no: 'WT2026010005', title: '数据服务网关偶发 502（连接池耗尽）',
      source: 'INCIDENT', sourceIncidentIds: ['ix9'],
      severity: '高', impact: '部分功能受影响', urgency: '紧急', priority: 'P1',
      status: 'CLOSED', handler: '陈志刚', dept: '运维中心 · 二线支持组',
      rootCause: '网关连接池上限配置偏低，在批量调用高峰（每日 09:00-10:00）出现连接耗尽，导致偶发 502。',
      solution: '将连接池上限由 200 提升至 500，并增加排队超时与熔断配置；观察 3 日无复现。',
      preventive: '将网关连接池使用率纳入监控阈值，超过 80% 触发预警。',
      notifyChannels: ['邮件'],
      notifyLogs: [], relatedChangeIds: [], relatedCiIds: ['ci15'], knowledgeId: null,
      createdAt: D(-14, 10, 0), expectAt: D(-10, 18, 0), resolvedAt: D(-11, 15, 0), closedAt: D(-10, 10, 0),
      timeline: [
        { at: D(-14, 10, 0), actor: '陈志刚', action: '由事件单创建问题单' },
        { at: D(-11, 15, 0), actor: '陈志刚', action: '解决', comment: '调整连接池配置并观察' },
        { at: D(-10, 10, 0), actor: '陈志刚', action: '关闭', comment: '观察 3 日无复现，问题关闭' }
      ]
    },
    {
      id: 'p06', no: 'WT2026010006', title: '慢病标签更新延迟（标签任务依赖未收敛）',
      source: 'MANUAL', sourceIncidentIds: [],
      severity: '中', impact: '轻微影响', urgency: '一般', priority: 'P2',
      status: 'NEW', handler: '—', dept: '',
      rootCause: '', notifyChannels: ['邮件'], notifyLogs: [],
      relatedChangeIds: [], relatedCiIds: [], knowledgeId: null,
      createdAt: D(0, 10, 0), expectAt: DD(7),
      timeline: [{ at: D(0, 10, 0), actor: '陈志刚', action: '手工创建问题单', comment: '待分派' }]
    }
  ];
}

function buildReleases(): any[] {
  return [
    {
      id: 'rl01', no: 'FB20260122001', title: '数据服务管理工具 v1.4.2 版本发布',
      demandIds: ['d01', 'd03'], changeIds: ['c04'], changeContent: '① 门急诊就诊明细服务新增 settle_type 出参；② 医疗资源指标口径调整（每千人口床位数）；③ 需求单流转状态实时刷新修复。',
      testResult: '测试环境回归通过，12 项用例全部通过；性能压测 QPS 1200 无异常。',
      releaseAt: D(-3, 22, 0) + '', downtime: '2026-01-24 22:00-23:00（预计 60 分钟）',
      status: 'CLOSED', applicant: '赵敏', approver: '孙立', approvedAt: D(-5, 10, 0),
      packages: [
        { version: 'v1.4.2', archivedAt: D(-3, 22, 0), operator: '赵敏', remark: '本次发布包，含 3 个变更' },
        { version: 'v1.4.1', archivedAt: D(-32, 22, 0), operator: '赵敏', remark: '上一稳定版本' },
        { version: 'v1.4.0', archivedAt: D(-60, 22, 0), operator: '赵敏', remark: '历史版本' }
      ],
      verifyItems: [
        { name: '门急诊就诊明细服务出参字段校验', result: '通过', remark: 'settle_type 正常返回' },
        { name: '医疗资源指标口径核对', result: '通过', remark: '与业务处室核对一致' },
        { name: '需求单流转状态刷新', result: '通过', remark: '审批后状态实时更新' },
        { name: 'API 服务调用成功率', result: '通过', remark: '发布后 24 小时成功率 99.97%' },
        { name: '文件服务下发任务', result: '通过', remark: '下发任务全部成功' },
        { name: '订阅方调用兼容性', result: '通过', remark: '3 个订阅应用无异常' },
        { name: '权限与鉴权', result: '通过', remark: '密钥校验正常' },
        { name: '日志与审计留痕', result: '通过', remark: '审计记录完整' }
      ],
      auditNote: '发布项事后审计完成：本次升级涉及的 3 个变更全部闭环，无遗留问题，审计结论为"通过"。',
      auditedAt: D(-1, 10, 0),
      timeline: [
        { at: D(-6, 9, 0), actor: '赵敏', action: '提交发布申请', comment: '由需求单 d01、d03 与变更单 c04 驱动' },
        { at: D(-5, 9, 0), actor: '陈志刚', action: '确认测试情况', comment: '回归与压测均通过' },
        { at: D(-5, 10, 0), actor: '孙立', action: '发布审批批复', comment: '同意在 01-24 22:00 窗口执行' },
        { at: D(-3, 22, 0), actor: '赵敏', action: '执行升级', comment: '发布包 v1.4.2 部署完成，停机 42 分钟' },
        { at: D(-3, 23, 0), actor: '陈志刚', action: '业务验证', comment: '8 项验证全部通过' },
        { at: D(-1, 10, 0), actor: '孙立', action: '发布审计', comment: '审计通过，本次升级闭环' }
      ]
    },
    {
      id: 'rl02', no: 'FB20260125002', title: '实时推送链路优化版本发布',
      demandIds: ['d04'], changeIds: [], changeContent: '① 传染病报告实时推送链路参数优化；② 脱敏组件性能优化；③ 推送失败自动重试机制。',
      testResult: '测试环境联调通过，推送时延由 8 秒降至 1.5 秒。',
      releaseAt: D(1, 23, 0) + '', downtime: '2026-01-28 23:00-24:00（预计 60 分钟）',
      status: 'VERIFYING', applicant: '赵敏', approver: '孙立', approvedAt: D(-1, 14, 0),
      packages: [{ version: 'v1.5.0', archivedAt: D(1, 23, 0), operator: '赵敏', remark: '本次发布包' }],
      verifyItems: [
        { name: '实时推送时延', result: '通过', remark: '时延 1.4 秒' },
        { name: '脱敏规则生效', result: '通过', remark: 'L3 字段掩码正确' },
        { name: '失败重试机制', result: '通过', remark: '模拟失败后 30 秒内重试成功' },
        { name: '订阅方数据完整性', result: '未执行' },
        { name: '回滚脚本可用性', result: '通过', remark: '已在测试环境验证' }
      ],
      timeline: [
        { at: D(-2, 10, 0), actor: '赵敏', action: '提交发布申请' },
        { at: D(-1, 14, 0), actor: '孙立', action: '发布审批批复' },
        { at: D(1, 23, 0), actor: '赵敏', action: '执行升级' },
        { at: D(2, 0, 0), actor: '陈志刚', action: '业务验证', comment: '部分验证项已完成，数据完整性验证待观察一个推送周期' }
      ]
    },
    {
      id: 'rl03', no: 'FB20260118003', title: '资源目录检索优化版本发布（已回滚）',
      demandIds: [], changeIds: [], changeContent: '① 全文检索索引结构优化；② 资源目录排序功能增强。',
      testResult: '测试环境通过，但生产环境索引重建耗时超出预期。',
      releaseAt: D(-9, 22, 0) + '', downtime: '2026-01-18 22:00-23:30',
      status: 'ROLLED_BACK', applicant: '赵敏', approver: '孙立', approvedAt: D(-11, 15, 0),
      packages: [
        { version: 'v1.4.3', archivedAt: D(-9, 22, 0), operator: '赵敏', remark: '本次发布包（已回滚）' },
        { version: 'v1.4.2', archivedAt: D(-3, 22, 0), operator: '赵敏', remark: '回滚目标版本' }
      ],
      verifyItems: [
        { name: '检索响应时间', result: '不通过', remark: '索引重建后检索响应时间反而上升' },
        { name: '资源目录排序', result: '通过' },
        { name: '检索结果准确性', result: '不通过', remark: '存在结果缺失' }
      ],
      rollback: { at: D(-9, 23, 0), reason: '上线后检索响应时间恶化且结果缺失，影响资源目录可用性', fromVersion: 'v1.4.3', toVersion: 'v1.4.2', operator: '赵敏' },
      timeline: [
        { at: D(-12, 9, 0), actor: '赵敏', action: '提交发布申请' },
        { at: D(-11, 15, 0), actor: '孙立', action: '发布审批批复' },
        { at: D(-9, 22, 0), actor: '赵敏', action: '执行升级' },
        { at: D(-9, 23, 0), actor: '陈志刚', action: '业务验证不通过', comment: '检索响应时间恶化，结果存在缺失' },
        { at: D(-9, 23, 0), actor: '赵敏', action: '发布撤回（回滚）', comment: '回滚至 v1.4.2，服务恢复正常' },
        { at: D(-8, 10, 0), actor: '孙立', action: '发布审计', comment: '本次发布失败已回滚，需重新评估索引方案后再次申请' }
      ]
    },
    {
      id: 'rl04', no: 'FB20260127004', title: '数据需求管理模块功能增强版本发布',
      demandIds: ['d12'], changeIds: ['c01', 'c02'], changeContent: '① 需求变更风险评估影响链路可视化增强；② 变更窗口支持业务事件日程叠加；③ 需求单批量审批。',
      testResult: '测试环境回归通过，15 项用例全部通过。',
      releaseAt: D(3, 22, 0) + '', downtime: '2026-01-30 22:00-23:00（预计 60 分钟）',
      status: 'APPROVED', applicant: '赵敏', approver: '孙立', approvedAt: D(0, 9, 0),
      packages: [{ version: 'v1.6.0', archivedAt: D(3, 22, 0), operator: '赵敏', remark: '本次发布包' }],
      verifyItems: [
        { name: '风险评估影响链路展示', result: '未执行' },
        { name: '变更窗口日程叠加', result: '未执行' },
        { name: '需求单批量审批', result: '未执行' },
        { name: '既有功能回归', result: '未执行' }
      ],
      timeline: [
        { at: D(-1, 11, 0), actor: '赵敏', action: '提交发布申请', comment: '由变更单 c01、c02 驱动' },
        { at: D(0, 9, 0), actor: '孙立', action: '发布审批批复', comment: '同意在 01-30 22:00 窗口执行，注意避让变更 c01 实施窗口' }
      ]
    },
    {
      id: 'rl05', no: 'FB20260126005', title: '数据分类分级规则库更新发布',
      demandIds: [], changeIds: [], changeContent: '新增 12 条敏感数据识别规则，更新脱敏算法参数模板（含 SM4 加密参数）。',
      testResult: '规则库在测试环境验证通过，识别命中率提升 8%。',
      releaseAt: D(2, 21, 0) + '', downtime: '无（热更新）',
      status: 'APPLYING', applicant: '周雅静', approver: null,
      packages: [{ version: 'rule-v2.2', archivedAt: D(-1, 16, 0), operator: '周雅静', remark: '规则库更新包' }],
      verifyItems: [
        { name: '识别规则命中率', result: '未执行' },
        { name: '脱敏算法效果', result: '未执行' },
        { name: '分类分级结果展示', result: '未执行' }
      ],
      timeline: [{ at: D(0, 10, 0), actor: '周雅静', action: '提交发布申请', comment: '等待测试情况确认' }]
    },
    {
      id: 'rl06', no: 'FB20260110006', title: '能力开放门户租户管理增强发布',
      demandIds: [], changeIds: [], changeContent: '① 租户注册企业资质校验增强；② 能力申请存储/CUP/内存配额校验。',
      testResult: '测试环境通过。',
      releaseAt: D(-16, 22, 0) + '', downtime: '2026-01-11 22:00-23:00',
      status: 'CLOSED', applicant: '赵敏', approver: '孙立', approvedAt: D(-18, 10, 0),
      packages: [{ version: 'v1.3.9', archivedAt: D(-16, 22, 0), operator: '赵敏', remark: '本次发布包' }],
      verifyItems: [
        { name: '租户资质校验', result: '通过' },
        { name: '能力申请配额校验', result: '通过' },
        { name: '租户审核流程', result: '通过' }
      ],
      auditNote: '发布项事后审计完成，无遗留问题。',
      auditedAt: D(-15, 10, 0),
      timeline: [
        { at: D(-19, 9, 0), actor: '赵敏', action: '提交发布申请' },
        { at: D(-18, 10, 0), actor: '孙立', action: '发布审批批复' },
        { at: D(-16, 22, 0), actor: '赵敏', action: '执行升级' },
        { at: D(-16, 23, 0), actor: '陈志刚', action: '业务验证通过' },
        { at: D(-15, 10, 0), actor: '孙立', action: '发布审计' }
      ]
    }
  ];
}

function buildEvaluations(): any[] {
  return [
    {
      id: 'ev01', no: 'PJ20260110001', demandId: 'd01', demandNo: 'XQ20260112001',
      title: '对「门急诊就诊明细查询服务」的评价',
      evaluator: '李慧敏', evaluatorOrg: '市医疗保障局', score: 5, evaluatedAt: D(-8, 10, 0),
      content: '数据质量好，字段口径清晰，交付及时。接口文档说明详细，脱敏规则符合监管要求。建议后续支持按科室维度直接聚合查询。',
      dims: { 数据质量: 5, 交付及时性: 5, 服务态度: 5, 文档完备性: 4, 问题响应速度: 5 },
      status: 'APPROVED', approvedAt: D(-7, 10, 0), approver: '张建国', visibleTo: 'BOTH',
      feedback: { id: 'fb01', user: '张建国', content: '感谢反馈。按科室维度聚合查询的需求已记录，将纳入下一版本需求池评估；如急需可在需求管理中单独提出。', at: D(-6, 15, 0), status: 'APPROVED', approvedAt: D(-6, 16, 0) }
    },
    {
      id: 'ev02', no: 'PJ20260115002', demandId: 'd03', demandNo: 'XQ20260119003',
      title: '对「医疗资源指标日度文件服务」的评价',
      evaluator: '张建国', evaluatorOrg: '市卫生健康委员会', score: 4, evaluatedAt: D(-2, 10, 0),
      content: '指标口径准确，下发及时。但 01-27 的文件下发失败，希望改进任务失败后的自动补推能力。',
      dims: { 数据质量: 5, 交付及时性: 3, 服务态度: 4, 文档完备性: 4, 问题响应速度: 4 },
      status: 'PENDING_APPROVE', visibleTo: 'SUPPLIER',
      feedback: null
    },
    {
      id: 'ev03', no: 'PJ20260120003', demandId: 'd02', demandNo: 'XQ20260116002',
      title: '对「药品与器械字典贯标加工」的评价',
      evaluator: '吴强', evaluatorOrg: '市药品监督管理局', score: 3, evaluatedAt: D(-3, 10, 0),
      content: '字典贯标整体可用，但首次贯标结果存在名称与批准文号不匹配问题，经反馈后已重新贯标。希望加强贯标结果的自动校验。',
      dims: { 数据质量: 3, 交付及时性: 3, 服务态度: 4, 文档完备性: 3, 问题响应速度: 4 },
      status: 'APPROVED', approvedAt: D(-2, 10, 0), approver: '张建国', visibleTo: 'BOTH',
      feedback: { id: 'fb02', user: '刘涛', content: '已定位为上游编码复用导致，现已按「编码+批准文号」组合键重新贯标并通过验证；贯标作业已增加唯一性校验规则，后续会输出异常清单。', at: D(-2, 16, 0), status: 'APPROVED', approvedAt: D(-1, 10, 0) }
    },
    {
      id: 'ev04', no: 'PJ20260124004', demandId: 'd05', demandNo: 'XQ20260118005',
      title: '对「医保结算数据文件服务」的评价',
      evaluator: '李慧敏', evaluatorOrg: '市医疗保障局', score: 3, evaluatedAt: D(-1, 10, 0),
      content: '文件格式变更为 GBK 后，我方解析脚本需要调整，建议变更前提前通知并保留过渡期。',
      dims: { 数据质量: 4, 交付及时性: 3, 服务态度: 3, 文档完备性: 3, 问题响应速度: 3 },
      status: 'REJECTED', approvedAt: null, approver: '张建国', rejectReason: '评价内容主要涉及变更通知流程，建议转为需求变更单提出，本评价不予展示。',
      visibleTo: 'SUPPLIER', feedback: null
    },
    {
      id: 'ev05', no: 'PJ20260126005', demandId: 'd14', demandNo: 'XQ20260120014',
      title: '对「血液管理专题数据交付」的评价',
      evaluator: '张建国', evaluatorOrg: '市卫生健康委员会', score: 4, evaluatedAt: D(-1, 15, 0),
      content: '数据完整，交付及时，满足血液管理专题分析需要。',
      dims: { 数据质量: 4, 交付及时性: 5, 服务态度: 4, 文档完备性: 4, 问题响应速度: 4 },
      status: 'APPROVED', approvedAt: D(0, 9, 0), approver: '孙立', visibleTo: 'SUPPLIER', feedback: null
    },
    {
      id: 'ev06', no: 'PJ20260127006', demandId: 'd13', demandNo: 'XQ20260122013',
      title: '对「可视化指标 API」的评价',
      evaluator: '孙立', evaluatorOrg: '三医联动信息化工作领导小组办公室', score: 5, evaluatedAt: D(0, 10, 0),
      content: '接口封装规范，调用稳定，支撑了决策层可视化展示。',
      dims: { 数据质量: 5, 交付及时性: 4, 服务态度: 5, 文档完备性: 5, 问题响应速度: 5 },
      status: 'PENDING_APPROVE', visibleTo: 'BOTH', approvedAt: null, feedback: null
    },
    {
      id: 'ev07', no: 'PJ20260125007', demandId: 'd14', demandNo: 'XQ20260120014',
      title: '对「血液采集与供应数据」的评价（历史）',
      evaluator: '郑晓', evaluatorOrg: '市疾病预防控制中心', score: 4, evaluatedAt: D(-5, 14, 0),
      content: '数据可用于专题分析，更新频率符合要求。',
      dims: { 数据质量: 4, 交付及时性: 4, 服务态度: 4, 文档完备性: 3, 问题响应速度: 4 },
      status: 'APPROVED', approvedAt: D(-4, 10, 0), approver: '张建国', visibleTo: 'SUPPLIER',
      feedback: { id: 'fb03', user: '张建国', content: '感谢评价，文档完备性方面我们会补充字段说明与样例。', at: D(-4, 15, 0), status: 'APPROVED', approvedAt: D(-3, 9, 0) }
    },
    {
      id: 'ev08', no: 'PJ20260112008', demandId: 'd01', demandNo: 'XQ20260112001',
      title: '对「门急诊费用统计服务」的评价（历史）',
      evaluator: '黄伟', evaluatorOrg: '市应急管理局', score: 2, evaluatedAt: D(-20, 10, 0),
      content: '接口响应较慢，高峰期经常超时，希望优化性能。',
      dims: { 数据质量: 3, 交付及时性: 2, 服务态度: 3, 文档完备性: 2, 问题响应速度: 2 },
      status: 'APPROVED', approvedAt: D(-19, 10, 0), approver: '张建国', visibleTo: 'BOTH',
      feedback: { id: 'fb04', user: '赵敏', content: '已排查为高峰期网关连接池耗尽，已完成连接池扩容与熔断配置优化（问题单 WT2026010005），请复测。', at: D(-18, 15, 0), status: 'APPROVED', approvedAt: D(-17, 9, 0) }
    }
  ];
}

function buildCallbacks(): any[] {
  return [
    { id: 'cb01', ticketType: '事件单', ticketId: 'i01', ticketNo: 'SJ20260125001', score: 5, comment: '响应很快，按知识库指引很快就定位到问题，已恢复。', status: '已回访', sentAt: D(-1, 11, 0), repliedAt: D(-1, 15, 0), to: '李慧敏' },
    { id: 'cb02', ticketType: '事件单', ticketId: 'i04', ticketNo: 'SJ20260124003', score: 4, comment: '已经恢复了，但希望根治，不要再出现。,', status: '已回访', sentAt: D(-2, 17, 0), repliedAt: D(-2, 18, 0), to: '王思远' },
    { id: 'cb03', ticketType: '需求单', ticketId: 'd01', ticketNo: 'XQ20260112001', score: 5, comment: '交付及时，数据可用。', status: '已回访', sentAt: D(-9, 17, 0), repliedAt: D(-8, 10, 0), to: '李慧敏' },
    { id: 'cb04', ticketType: '事件单', ticketId: 'i05', ticketNo: 'SJ20260126004', score: null, comment: '', status: '待回访', sentAt: D(0, 9, 0), to: '李慧敏' },
    { id: 'cb05', ticketType: '需求单', ticketId: 'd03', ticketNo: 'XQ20260119003', score: null, comment: '', status: '待回访', sentAt: D(-2, 11, 0), to: '张建国' },
    { id: 'cb06', ticketType: '事件单', ticketId: 'i07', ticketNo: 'SJ20260127006', score: null, comment: '', status: '待回访', sentAt: D(0, 9, 0), to: '吴强' },
    { id: 'cb07', ticketType: '任务单', ticketId: 't01', ticketNo: 'RW20260114001', score: 5, comment: '加工结果符合预期。', status: '已回访', sentAt: D(-10, 17, 0), repliedAt: D(-10, 18, 0), to: '李慧敏' },
    { id: 'cb08', ticketType: '事件单', ticketId: 'i03', ticketNo: 'SJ20260126003', score: null, comment: '', status: '待回访', sentAt: D(0, 9, 0), to: '吴强' }
  ];
}

function buildBroadcasts(): any[] {
  return [
    {
      id: 'gb01', no: 'GB20260126001', title: '【事件通告】门急诊就诊记录数据延迟及处置进展',
      content: '各位订阅方：\n2026-01-25 接反馈，门急诊就诊明细数据出现 T+1 延迟。经排查，根因为上游 3 家医院 LIS 系统夜间升级导致采集批次未完整上报。\n处置进展：\n1. 已完成手工补采，数据已恢复可用；\n2. 已创建问题单 WT2026010001 做根因整改，临时方案为发现延迟后 4 小时内手工补采恢复；\n3. 根治方案（批次完整性校验与自动补采）已派发任务单 RW20260125009。\n后续进展将通过本渠道持续通告。',
      targets: [{ type: 'GROUP', ids: ['用数方', '订阅方'] }, { type: 'ORG', ids: ['市医疗保障局', '市疾病预防控制中心', '区全民健康信息平台（朝阳区）'] }],
      channels: ['站内', '邮件', '短信'], sender: '王思远', senderOrg: '三医数据底座服务台', sentAt: D(-1, 16, 0),
      readBy: ['李慧敏', '郑晓'], status: 'NEW', relatedId: 'i02'
    },
    {
      id: 'gb02', no: 'GB20260127002', title: '【变更通知】01-28 至 01-30 数据服务变更窗口安排',
      content: '各位用户：\n以下时段将安排数据服务变更，期间相关服务可能有短暂波动：\n1. 01-28 20:00 门急诊就诊明细查询服务字段范围调整（新增出参，向后兼容）；\n2. 01-30 22:00 医疗资源专题视图字段补充（需重建视图，文件服务沿用上一版本快照）；\n3. 01-30 22:00 数据需求管理模块功能增强版本发布。\n请相关订阅方提前做好适配准备。',
      targets: [{ type: 'GROUP', ids: ['全部用户'] }],
      channels: ['站内', '邮件'], sender: '赵敏', senderOrg: '平台运营中心', sentAt: D(0, 9, 0),
      readBy: [], status: 'NEW', relatedId: 'c01'
    },
    {
      id: 'gb03', no: 'GB20260120003', title: '【安全提醒】密钥更换通知',
      content: '为提升平台安全性，平台已对门急诊就诊实时推送服务（sv10）的全部订购方执行密钥更换。请相关应用在 2026-01-25 前完成 appSecret 更新，逾期将无法正常调用。密钥可在「服务订阅 → 密钥管理」中查看与补发。',
      targets: [{ type: 'GROUP', ids: ['订阅方'] }],
      channels: ['站内', '邮件', '短信'], sender: '赵敏', senderOrg: '平台运营中心', sentAt: D(-12, 9, 0),
      readBy: ['张建国', '李慧敏'], status: 'READ', relatedId: 'sb07'
    },
    {
      id: 'gb04', no: 'GB20260115004', title: '【服务公告】数据沙箱使用规范更新',
      content: '数据沙箱使用规范已更新，高敏感数据（L4）的开发利用必须使用训练沙箱构建模型、数据沙箱生产运行、生产沙箱结果数据整合输出，原始明细数据不出数据沙箱。相关规范详见知识库《数据沙箱使用规范（原始明细不出沙箱）》。',
      targets: [{ type: 'GROUP', ids: ['全部用户'] }, { type: 'ORG', ids: ['市疾病预防控制中心', '北京大学第三医院'] }],
      channels: ['站内', '邮件'], sender: '周雅静', senderOrg: '安全与合规管理处', sentAt: D(-12, 14, 0),
      readBy: ['郑晓', '张建国', '李慧敏'], status: 'READ', relatedId: 'k06'
    }
  ];
}

/* ============================================== 统计派生（页面直接可用）-- */
function buildTrend(days: number, base: number, wave: number) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(NOW.getTime()); d.setDate(d.getDate() - i);
    const v = Math.round(base + Math.sin(i / 2.6) * wave + (i % 7 === 0 ? -wave * 0.8 : 0) + (days - i) * 0.6);
    out.push({ name: (d.getMonth() + 1) + '-' + d.getDate(), value: Math.max(1, v), date: DD(-i) });
  }
  return out;
}

export const seed = {
  now: NOW,
  orgs: ORGS,
  users: USERS,
  roles: ROLES,
  tenants: TENANTS,
  apps: APPS,
  resources: RESOURCES,
  classifications: CLASSIFICATIONS,
  samples: SAMPLES,
  services: SERVICES,
  cis: CIS,
  workflows: WORKFLOWS,
  demandTemplates: DEMAND_TEMPLATES,
  catalogItems: CATALOG_ITEMS,
  incidentCategories: INCIDENT_CATEGORIES,
  incidentTemplates: INCIDENT_TEMPLATES,
  decisionTree: DECISION_TREE,
  kbCategories: KB_CATEGORIES,
  knowledges: KNOWLEDGES,
  qnas: QNAS,
  audits: AUDIT_SEED,
  demands: buildDemands,
  changes: buildChanges,
  tasks: buildTasks,
  subscriptions: buildSubscriptions,
  tenantRegs: buildTenantRegs,
  capabilityApplies: buildCapabilityApplies,
  securityApprovals: buildSecurityApprovals,
  incidents: buildIncidents,
  problems: buildProblems,
  releases: buildReleases,
  evaluations: buildEvaluations,
  callbacks: buildCallbacks,
  broadcasts: buildBroadcasts,
  messages: [],
  /* 从 config.roles 注入角色，保证 store 能读到 */
  /* 供页面复用的统计生成器 */
  trend: buildTrend,
  D: D, DD: DD, seq: seq
};
