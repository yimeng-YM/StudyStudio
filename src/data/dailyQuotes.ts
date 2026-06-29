/**
 * 每日一言数据
 * 包含励志名言、古诗词、学习格言等
 * 每条包含：quote (名言内容), author (作者/出处)
 */
export interface DailyQuote {
  quote: string;
  author: string;
}

export const DAILY_QUOTES: DailyQuote[] = [
  { quote: '学而不思则罔，思而不学则殆。', author: '孔子《论语》' },
  { quote: '千里之行，始于足下。', author: '老子《道德经》' },
  { quote: '业精于勤，荒于嬉；行成于思，毁于随。', author: '韩愈《进学解》' },
  { quote: '不积跬步，无以至千里；不积小流，无以成江海。', author: '荀子《劝学》' },
  { quote: '书山有路勤为径，学海无涯苦作舟。', author: '韩愈' },
  { quote: '温故而知新，可以为师矣。', author: '孔子《论语》' },
  { quote: '敏而好学，不耻下问。', author: '孔子《论语》' },
  { quote: '学如逆水行舟，不进则退。', author: '《增广贤文》' },
  { quote: '世上无难事，只怕有心人。', author: '谚语' },
  { quote: '知之者不如好之者，好之者不如乐之者。', author: '孔子《论语》' },
  { quote: '博学之，审问之，慎思之，明辨之，笃行之。', author: '《中庸》' },
  { quote: '三人行，必有我师焉。', author: '孔子《论语》' },
  { quote: '宝剑锋从磨砺出，梅花香自苦寒来。', author: '《警世贤文》' },
  { quote: '黑发不知勤学早，白首方悔读书迟。', author: '颜真卿《劝学》' },
  { quote: '盛年不重来，一日难再晨。及时当勉励，岁月不待人。', author: '陶渊明《杂诗》' },
  { quote: '读书破万卷，下笔如有神。', author: '杜甫' },
  { quote: '纸上得来终觉浅，绝知此事要躬行。', author: '陆游《冬夜读书示子聿》' },
  { quote: '问渠那得清如许，为有源头活水来。', author: '朱熹《观书有感》' },
  { quote: '路漫漫其修远兮，吾将上下而求索。', author: '屈原《离骚》' },
  { quote: '非淡泊无以明志，非宁静无以致远。', author: '诸葛亮《诫子书》' },
  { quote: '天才就是百分之一的灵感加上百分之九十九的汗水。', author: '爱迪生' },
  { quote: '知识就是力量。', author: '弗朗西斯·培根' },
  { quote: '想象力比知识更重要。', author: '爱因斯坦' },
  { quote: '为中华之崛起而读书。', author: '周恩来' },
  { quote: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
  { quote: 'Stay hungry, stay foolish.', author: 'Steve Jobs' },
  { quote: 'The journey of a thousand miles begins with a single step.', author: 'Lao Tzu' },
  { quote: 'It does not matter how slowly you go as long as you do not stop.', author: 'Confucius' },
  { quote: '教育的根是苦的，但果实是甜的。', author: '亚里士多德' },
  { quote: '吾生也有涯，而知也无涯。', author: '庄子' },
  { quote: '天行健，君子以自强不息。', author: '《周易》' },
  { quote: '有志者，事竟成。', author: '《后汉书》' },
  { quote: '玉不琢，不成器；人不学，不知道。', author: '《礼记》' },
  { quote: '少壮不努力，老大徒伤悲。', author: '《长歌行》' },
  { quote: '一寸光阴一寸金，寸金难买寸光阴。', author: '《增广贤文》' },
  { quote: 'Learning is a treasure that will follow its owner everywhere.', author: 'Chinese Proverb' },
  { quote: '今日事，今日毕。', author: '谚语' },
  { quote: '人生在勤，不索何获。', author: '张衡' },
  { quote: '不怕慢，就怕站。', author: '谚语' },
  { quote: '滴水穿石，非一日之功。', author: '谚语' },
];

/**
 * 根据日期获取每日一言
 * 使用年月日组合的哈希值确保每天固定展示一条，且均匀分布
 * @param date - 日期对象，默认为当天
 * @returns 返回匹配的 DailyQuote 对象
 */
export function getDailyQuote(date: Date = new Date()): DailyQuote {
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24)
  );
  const index = dayOfYear % DAILY_QUOTES.length;
  return DAILY_QUOTES[index];
}
