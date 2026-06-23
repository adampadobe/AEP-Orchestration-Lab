/**
 * Sky News UK demo — content from scrape-data.json (curated public headlines).
 */
window.SkyNewsData = {
  scrape_id: 'sky-news-uk-20260623-a636a2',
  siteName: 'Sky News',
  navLinks: [
    { text: 'Home', section: 'home' },
    { text: 'UK', section: 'uk', active: true },
    { text: 'Politics', section: 'politics' },
    { text: 'World', section: 'world' },
    { text: 'US', section: 'us' },
    { text: 'Money', section: 'money' },
    { text: 'Science, Climate & Tech', section: 'tech' },
    { text: 'Ents & Arts', section: 'ents' },
    { text: 'Offbeat', section: 'offbeat' },
    { text: 'Analysis', section: 'analysis' },
    { text: 'Weather', section: 'weather' },
    { text: 'Watch Live', section: 'live' }
  ],
  sections: {
    uk: {
      title: 'UK News',
      hero: {
        id: 'story-13388452',
        headline: 'Starmer says welfare vote will go ahead despite threat of Labour rebellion',
        standfirst: 'Sir Keir Starmer insists reforms will be pressed ahead as more than 100 Labour MPs signal opposition to the government\'s welfare bill.',
        category: 'Politics',
        timestamp: 'Wednesday 25 June 2025 16:15, UK',
        isLive: true,
        author: 'Beth Rigby, Political Editor'
      },
      secondary: [
        {
          id: 'story-13387759',
          headline: 'PM warns of \'era of radical uncertainty\' as UK pledges to increase defence spending',
          category: 'UK',
          timestamp: 'Tuesday 24 June 2025 13:24, UK'
        },
        {
          id: 'story-13388026',
          headline: 'More Britons than ever struggling to make ends meet, report warns',
          category: 'UK',
          timestamp: 'Wednesday 25 June 2025 14:25, UK'
        }
      ],
      stories: [
        { id: 'story-13388485', headline: 'Patient\'s death linked to cyber attack on NHS, hospital trust says', category: 'Science, Climate & Tech', timestamp: 'Wed 25 Jun 2025 17:02', tone: 'tech' },
        { id: 'story-13387936', headline: 'Starmer defiant over welfare cuts as Sadiq Khan calls for rethink', category: 'Politics', timestamp: 'Tue 24 Jun 2025 17:33', tone: 'politics' },
        { id: 'story-13387674', headline: 'Labour MPs table reasoned amendment in attempt to halt welfare bill', category: 'Politics', timestamp: 'Mon 23 Jun 2025 11:40', tone: 'politics' },
        { id: 'story-nato-hague', headline: 'NATO allies agree to increase defence spend to 5% by 2035', category: 'World', timestamp: 'Tue 24 Jun 2025 09:15', tone: 'world' },
        { id: 'story-council-tax', headline: 'Council tax arrears rise 11% to £6.6bn across England', category: 'Money', timestamp: 'Wed 25 Jun 2025 08:30', tone: 'money' },
        { id: 'story-iran-israel', headline: 'Escalating conflict between Iran, US and Israel raises NATO security fears', category: 'World', timestamp: 'Tue 24 Jun 2025 18:45', tone: 'world' }
      ]
    },
    politics: {
      title: 'Politics',
      stories: [
        { id: 'story-13388452', headline: 'Starmer says welfare vote will go ahead despite threat of Labour rebellion', category: 'Politics', timestamp: 'Wed 25 Jun 2025 16:15', tone: 'politics', isLive: true },
        { id: 'story-13387936', headline: 'Starmer defiant over welfare cuts as Sadiq Khan calls for rethink', category: 'Politics', timestamp: 'Tue 24 Jun 2025 17:33', tone: 'politics' },
        { id: 'story-13387674', headline: 'Labour MPs table reasoned amendment in attempt to halt welfare bill', category: 'Politics', timestamp: 'Mon 23 Jun 2025 11:40', tone: 'politics' },
        { id: 'story-pip-reform', headline: 'What the welfare reforms mean for PIP and universal credit claimants', category: 'Analysis', timestamp: 'Wed 25 Jun 2025 12:00', tone: 'analysis' }
      ]
    },
    world: {
      title: 'World',
      stories: [
        { id: 'story-nato-hague', headline: 'NATO allies agree to increase defence spend to 5% by 2035', category: 'World', timestamp: 'Tue 24 Jun 2025 09:15', tone: 'world' },
        { id: 'story-iran-israel', headline: 'Escalating conflict between Iran, US and Israel raises NATO security fears', category: 'World', timestamp: 'Tue 24 Jun 2025 18:45', tone: 'world' },
        { id: 'story-ukraine', headline: 'Ukraine war enters new phase as allies debate long-range weapons', category: 'World', timestamp: 'Wed 25 Jun 2025 07:20', tone: 'world' }
      ]
    },
    money: {
      title: 'Money',
      stories: [
        { id: 'story-council-tax', headline: 'Council tax arrears rise 11% to £6.6bn across England', category: 'Money', timestamp: 'Wed 25 Jun 2025 08:30', tone: 'money' },
        { id: 'story-13388026', headline: 'More Britons than ever struggling to make ends meet, report warns', category: 'UK', timestamp: 'Wed 25 Jun 2025 14:25', tone: 'money' }
      ]
    },
    tech: {
      title: 'Science, Climate & Tech',
      stories: [
        { id: 'story-13388485', headline: 'Patient\'s death linked to cyber attack on NHS, hospital trust says', category: 'Science, Climate & Tech', timestamp: 'Wed 25 Jun 2025 17:02', tone: 'tech' }
      ]
    },
    analysis: {
      title: 'Analysis',
      stories: [
        { id: 'story-pip-reform', headline: 'What the welfare reforms mean for PIP and universal credit claimants', category: 'Analysis', timestamp: 'Wed 25 Jun 2025 12:00', tone: 'analysis' }
      ]
    },
    home: { title: 'Home', redirect: 'uk' },
    us: { title: 'US', stories: [{ id: 'story-us-placeholder', headline: 'US headlines — demo section placeholder', category: 'US', timestamp: 'Today', tone: 'world' }] },
    ents: { title: 'Ents & Arts', stories: [{ id: 'story-ents-placeholder', headline: 'Entertainment headlines — demo section placeholder', category: 'Ents & Arts', timestamp: 'Today', tone: 'ents' }] },
    offbeat: { title: 'Offbeat', stories: [{ id: 'story-offbeat-placeholder', headline: 'Offbeat stories — demo section placeholder', category: 'Offbeat', timestamp: 'Today', tone: 'offbeat' }] },
    weather: { title: 'Weather', stories: [{ id: 'story-weather-placeholder', headline: 'UK weather forecast — demo section placeholder', category: 'Weather', timestamp: 'Today', tone: 'weather' }] },
    live: { title: 'Watch Live', isLiveHub: true }
  },
  liveSection: {
    title: 'Politics Hub Live',
    updates: [
      { time: '16:42', text: 'Armed forces minister Luke Pollard says talks continue with rebel MPs about potential concessions on welfare reforms.' },
      { time: '16:15', text: 'Sir Keir Starmer: "We are committed to reforming our welfare system. It doesn\'t work. It traps people."' },
      { time: '15:30', text: 'More than 100 Labour MPs have signed a reasoned amendment that could halt the government\'s welfare bill.' },
      { time: '14:55', text: 'Sir Sadiq Khan becomes most senior Labour figure to call for a rethink of disability benefit proposals.' }
    ]
  },
  videos: [
    { id: 'video-politics-hub', title: 'The Politics Hub with Sophy Ridge', duration: 'Live' },
    { id: 'video-nato-summit', title: 'Starmer on defence spending at NATO summit', duration: '4:12' },
    { id: 'video-welfare-explainer', title: 'Welfare reforms explained in two minutes', duration: '2:04' },
    { id: 'video-nhs-cyber', title: 'How the NHS cyber attack disrupted hospitals', duration: '3:38' }
  ],
  articleBodies: {
    'story-13388452': 'Sir Keir Starmer has said a vote on welfare reforms will go ahead next week despite an unprecedented number of Labour MPs expected to rebel.\n\nSpeaking at the NATO summit, the prime minister said there was a clear moral case for reforming a system that "traps people" and must be made fit for the future.\n\nMore than 100 Labour MPs have put their names to a reasoned amendment that could stop the government\'s welfare bill in its tracks. Ministers say the reforms will help get people into work, but many MPs are worried it will push disabled people into poverty.',
    'story-13387759': 'Sir Keir Starmer said the UK is set to increase spending on defence, security and resilience to 5% of GDP by 2035 to meet an "era of radical uncertainty".\n\nThe move forms part of a new spending pledge by the NATO alliance. The funding will be split, with 3.5% of GDP going on core defence and 1.5% on homeland security and national resilience.',
    'story-13388026': 'More Britons than ever are struggling to make ends meet, according to a new report published as fresh government figures showed an 11% increase in council tax arrears across England.\n\nResearchers also found about 40% of Britons support spending more money on weapons and troops amid heightened security concerns.',
    'story-13388485': 'The death of a patient has been linked to a cyber attack on the NHS, King\'s College Hospital NHS Foundation Trust has confirmed.\n\nThe patient died unexpectedly during the attack after a long wait for a blood test result. IT company Synnovis was the victim of a ransomware attack last June, understood to be carried out by the Russian group Qilin.',
    'story-13387936': 'Sir Keir Starmer has reaffirmed his desire to push through controversial benefit cuts, despite growing criticism from Labour figures including Sir Sadiq Khan.\n\nThe mayor of London has become the most senior Labour figure to call for a rethink of proposals that he warned would destroy the financial safety net for too many disabled Londoners.',
    'story-13387674': 'More than 100 Labour MPs have signed a reasoned amendment to oppose the government\'s welfare proposals — which, if passed, would effectively kill the legislation.\n\nThe plans restrict eligibility for personal independence payments while also cutting universal credit in a bid to slash £5bn a year from the welfare bill by 2030.',
    'story-nato-hague': 'NATO leaders are expected to approve a new defence and security investment goal as the UK publishes an updated national security strategy highlighting energy, food and borders.',
    'story-council-tax': 'Council tax arrears across England have risen 11% to a total of £6.6bn amid a continued squeeze on household finances from essential bills.',
    'story-iran-israel': 'Critics have pointed to the escalating conflict between Iran, the US and Israel alongside Russia\'s war in Ukraine as evidence of radical uncertainty facing NATO allies.',
    'story-ukraine': 'Western allies are debating the provision of long-range weapons as Ukraine\'s conflict with Russia enters a new phase.',
    'story-pip-reform': 'The government\'s welfare bill outlines proposals to make it harder for some disabled people to qualify for PIP while also cutting universal credit. Existing claimants will be given a 13-week phase-out period of financial support.'
  },
  footerLinks: [
    'About Sky News', 'Sky News International', 'Contact Us', 'Sky Data', 'Sky News RSS',
    'Sky News For Your Phone', 'Privacy & Cookies', 'Terms & Conditions'
  ]
};
