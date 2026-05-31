// Mock World Cup 2026 Matches Data
// Matches are styled in the raw API format expected by formatMatchForDb in db.js

export const mockMatches = [
    // GROUP A
    {
        id: 2001,
        matchday: 1,
        group: 'GROUP_A',
        stage: 'GROUP_STAGE',
        homeTeam: { name: 'Canada', crest: 'https://crests.football-data.org/can.png', tla: 'CAN' },
        awayTeam: { name: 'USA', crest: 'https://crests.football-data.org/usa.png', tla: 'USA' },
        utcDate: '2026-06-11T20:00:00Z',
        status: 'SCHEDULED',
        score: { duration: 'REGULAR', fullTime: { home: null, away: null } }
    },
    {
        id: 2002,
        matchday: 1,
        group: 'GROUP_A',
        stage: 'GROUP_STAGE',
        homeTeam: { name: 'Mexico', crest: 'https://crests.football-data.org/mex.png', tla: 'MEX' },
        awayTeam: { name: 'New Zealand', crest: 'https://crests.football-data.org/nzl.png', tla: 'NZL' },
        utcDate: '2026-06-12T18:00:00Z',
        status: 'SCHEDULED',
        score: { duration: 'REGULAR', fullTime: { home: null, away: null } }
    },
    {
        id: 2003,
        matchday: 2,
        group: 'GROUP_A',
        stage: 'GROUP_STAGE',
        homeTeam: { name: 'Canada', crest: 'https://crests.football-data.org/can.png', tla: 'CAN' },
        awayTeam: { name: 'Mexico', crest: 'https://crests.football-data.org/mex.png', tla: 'MEX' },
        utcDate: '2026-06-16T15:00:00Z',
        status: 'SCHEDULED',
        score: { duration: 'REGULAR', fullTime: { home: null, away: null } }
    },
    {
        id: 2004,
        matchday: 2,
        group: 'GROUP_A',
        stage: 'GROUP_STAGE',
        homeTeam: { name: 'USA', crest: 'https://crests.football-data.org/usa.png', tla: 'USA' },
        awayTeam: { name: 'New Zealand', crest: 'https://crests.football-data.org/nzl.png', tla: 'NZL' },
        utcDate: '2026-06-17T21:00:00Z',
        status: 'SCHEDULED',
        score: { duration: 'REGULAR', fullTime: { home: null, away: null } }
    },

    // GROUP B
    {
        id: 2005,
        matchday: 1,
        group: 'GROUP_B',
        stage: 'GROUP_STAGE',
        homeTeam: { name: 'England', crest: 'https://crests.football-data.org/eng.png', tla: 'ENG' },
        awayTeam: { name: 'Spain', crest: 'https://crests.football-data.org/esp.png', tla: 'ESP' },
        utcDate: '2026-06-13T14:00:00Z',
        status: 'SCHEDULED',
        score: { duration: 'REGULAR', fullTime: { home: null, away: null } }
    },
    {
        id: 2006,
        matchday: 1,
        group: 'GROUP_B',
        stage: 'GROUP_STAGE',
        homeTeam: { name: 'Italy', crest: 'https://crests.football-data.org/ita.png', tla: 'ITA' },
        awayTeam: { name: 'Japan', crest: 'https://crests.football-data.org/jpn.png', tla: 'JPN' },
        utcDate: '2026-06-13T20:00:00Z',
        status: 'SCHEDULED',
        score: { duration: 'REGULAR', fullTime: { home: null, away: null } }
    },

    // GROUP C
    {
        id: 2007,
        matchday: 1,
        group: 'GROUP_C',
        stage: 'GROUP_STAGE',
        homeTeam: { name: 'Argentina', crest: 'https://crests.football-data.org/arg.png', tla: 'ARG' },
        awayTeam: { name: 'France', crest: 'https://crests.football-data.org/fra.png', tla: 'FRA' },
        utcDate: '2026-06-14T17:00:00Z',
        status: 'SCHEDULED',
        score: { duration: 'REGULAR', fullTime: { home: null, away: null } }
    },
    {
        id: 2008,
        matchday: 1,
        group: 'GROUP_C',
        stage: 'GROUP_STAGE',
        homeTeam: { name: 'Morocco', crest: 'https://crests.football-data.org/mar.png', tla: 'MAR' },
        awayTeam: { name: 'Australia', crest: 'https://crests.football-data.org/aus.png', tla: 'AUS' },
        utcDate: '2026-06-14T20:00:00Z',
        status: 'SCHEDULED',
        score: { duration: 'REGULAR', fullTime: { home: null, away: null } }
    },

    // GROUP D
    {
        id: 2009,
        matchday: 1,
        group: 'GROUP_D',
        stage: 'GROUP_STAGE',
        homeTeam: { name: 'Brazil', crest: 'https://crests.football-data.org/bra.png', tla: 'BRA' },
        awayTeam: { name: 'Germany', crest: 'https://crests.football-data.org/deu.png', tla: 'GER' },
        utcDate: '2026-06-15T19:00:00Z',
        status: 'SCHEDULED',
        score: { duration: 'REGULAR', fullTime: { home: null, away: null } }
    },
    {
        id: 2010,
        matchday: 1,
        group: 'GROUP_D',
        stage: 'GROUP_STAGE',
        homeTeam: { name: 'Portugal', crest: 'https://crests.football-data.org/por.png', tla: 'POR' },
        awayTeam: { name: 'South Korea', crest: 'https://crests.football-data.org/kor.png', tla: 'KOR' },
        utcDate: '2026-06-15T22:00:00Z',
        status: 'SCHEDULED',
        score: { duration: 'REGULAR', fullTime: { home: null, away: null } }
    },

    // GROUP E
    {
        id: 2011,
        matchday: 1,
        group: 'GROUP_E',
        stage: 'GROUP_STAGE',
        homeTeam: { name: 'Netherlands', crest: 'https://crests.football-data.org/nld.png', tla: 'NED' },
        awayTeam: { name: 'Belgium', crest: 'https://crests.football-data.org/bel.png', tla: 'BEL' },
        utcDate: '2026-06-18T14:00:00Z',
        status: 'SCHEDULED',
        score: { duration: 'REGULAR', fullTime: { home: null, away: null } }
    },

    // GROUP F
    {
        id: 2012,
        matchday: 1,
        group: 'GROUP_F',
        stage: 'GROUP_STAGE',
        homeTeam: { name: 'Uruguay', crest: 'https://crests.football-data.org/ury.png', tla: 'URU' },
        awayTeam: { name: 'Croatia', crest: 'https://crests.football-data.org/hrv.png', tla: 'CRO' },
        utcDate: '2026-06-19T18:00:00Z',
        status: 'SCHEDULED',
        score: { duration: 'REGULAR', fullTime: { home: null, away: null } }
    },

    // GROUP G
    {
        id: 2013,
        matchday: 1,
        group: 'GROUP_G',
        stage: 'GROUP_STAGE',
        homeTeam: { name: 'Switzerland', crest: 'https://crests.football-data.org/che.png', tla: 'SUI' },
        awayTeam: { name: 'Denmark', crest: 'https://crests.football-data.org/dnk.png', tla: 'DEN' },
        utcDate: '2026-06-20T16:00:00Z',
        status: 'SCHEDULED',
        score: { duration: 'REGULAR', fullTime: { home: null, away: null } }
    },

    // GROUP H
    {
        id: 2014,
        matchday: 1,
        group: 'GROUP_H',
        stage: 'GROUP_STAGE',
        homeTeam: { name: 'Senegal', crest: 'https://crests.football-data.org/sen.png', tla: 'SEN' },
        awayTeam: { name: 'Colombia', crest: 'https://crests.football-data.org/col.png', tla: 'COL' },
        utcDate: '2026-06-21T20:00:00Z',
        status: 'SCHEDULED',
        score: { duration: 'REGULAR', fullTime: { home: null, away: null } }
    },

    // KNOCKOUT STAGE - ROUND OF 16
    {
        id: 3001,
        matchday: 4,
        group: null,
        stage: 'ROUND_OF_16',
        homeTeam: { name: 'Winner Group A', crest: null, tla: 'WGA' },
        awayTeam: { name: 'Runner-up Group B', crest: null, tla: 'RUA' },
        utcDate: '2026-06-27T18:00:00Z',
        status: 'SCHEDULED',
        score: { duration: 'REGULAR', fullTime: { home: null, away: null } }
    },
    {
        id: 3002,
        matchday: 4,
        group: null,
        stage: 'ROUND_OF_16',
        homeTeam: { name: 'Winner Group C', crest: null, tla: 'WGC' },
        awayTeam: { name: 'Runner-up Group D', crest: null, tla: 'RUD' },
        utcDate: '2026-06-28T21:00:00Z',
        status: 'SCHEDULED',
        score: { duration: 'REGULAR', fullTime: { home: null, away: null } }
    },

    // KNOCKOUT STAGE - QUARTER FINALS
    {
        id: 4001,
        matchday: 5,
        group: null,
        stage: 'QUARTER_FINALS',
        homeTeam: { name: 'Winner R16-1', crest: null, tla: 'WQ1' },
        awayTeam: { name: 'Winner R16-2', crest: null, tla: 'WQ2' },
        utcDate: '2026-07-03T18:00:00Z',
        status: 'SCHEDULED',
        score: { duration: 'REGULAR', fullTime: { home: null, away: null } }
    },

    // KNOCKOUT STAGE - SEMI FINALS
    {
        id: 5001,
        matchday: 6,
        group: null,
        stage: 'SEMI_FINALS',
        homeTeam: { name: 'Winner QF-1', crest: null, tla: 'WS1' },
        awayTeam: { name: 'Winner QF-2', crest: null, tla: 'WS2' },
        utcDate: '2026-07-07T20:00:00Z',
        status: 'SCHEDULED',
        score: { duration: 'REGULAR', fullTime: { home: null, away: null } }
    },

    // KNOCKOUT STAGE - FINAL
    {
        id: 6001,
        matchday: 7,
        group: null,
        stage: 'FINAL',
        homeTeam: { name: 'Finalist 1', crest: null, tla: 'FN1' },
        awayTeam: { name: 'Finalist 2', crest: null, tla: 'FN2' },
        utcDate: '2026-07-19T19:00:00Z',
        status: 'SCHEDULED',
        score: { duration: 'REGULAR', fullTime: { home: null, away: null } }
    }
];
