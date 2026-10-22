window.DEMO = {
  stores: ['静安','徐汇','浦东','长宁','杨浦','闵行'],
  thisWeek: [286,241,312,168,139,138],
  lastWeek: [251,229,270,160,131,104],
  weeks: ['W35','W36','W37','W38','W39','W40','W41','W42'],
  trend: [98,104,101,112,108,115,121,128.5],
  orders: [
    {id:'SO-24817',store:'浦东',customer:'林晓雯',amount:1286,status:'已付款',date:'10-19'},
    {id:'SO-24816',store:'静安',customer:'周子昂',amount:432,status:'配送中',date:'10-19'},
    {id:'SO-24815',store:'徐汇',customer:'陈一鸣',amount:2310,status:'已付款',date:'10-18'},
    {id:'SO-24814',store:'长宁',customer:'王若溪',amount:168,status:'已退款',date:'10-18'},
    {id:'SO-24813',store:'浦东',customer:'赵安然',amount:875,status:'待发货',date:'10-18'},
    {id:'SO-24812',store:'杨浦',customer:'孙嘉禾',amount:96,status:'已付款',date:'10-17'},
    {id:'SO-24811',store:'闵行',customer:'李沐阳',amount:1540,status:'配送中',date:'10-17'},
    {id:'SO-24810',store:'静安',customer:'吴思远',amount:328,status:'已付款',date:'10-17'}
  ],
  tree: { name:'门店增长计划', children:[
    { name:'拉新', children:[{name:'小红书投放'},{name:'社群裂变'},{name:'异业合作'}]},
    { name:'转化', children:[{name:'新品试吃'},{name:'满减活动'}]},
    { name:'复购', children:[{name:'会员积分'},{name:'生日券'},{name:'储值卡'}]},
    { name:'运营', children:[{name:'排班优化'},{name:'库存预警'}]},
    { name:'数据', children:[{name:'周报自动化'},{name:'门店看板'}]}
  ]}
};
