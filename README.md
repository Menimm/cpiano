# פסנתרון HERO (גרסה נקייה)

ביצעתי איפוס מלא לקבצים והעליתי גרסה נקייה של האפליקציה.

## מה יש בגרסה הזו
- משחק Guitar Hero לפסנתר עם תווים נופלים.
- מצב מקלדת (1-8) + מצב מיקרופון.
- תצוגת חמשה ברורה עם תו נוכחי.
- גרסה גלויה למעלה ולמטה:
  - `Build: clean-v2 | <lastModified ISO time>`
  - `Version: clean-v2 | <lastModified ISO time>`

## הרצה
```bash
python3 -m http.server 4173
```
ואז לפתוח:

http://localhost:4173

## הערה לגבי Merge
כן, `squash merge` זה תקין לגמרי אם אתם רוצים היסטוריה נקייה ב-main.


## Why it can show "hours ago"
The version label uses `document.lastModified` from the served file.
If it shows an old time, you are likely seeing a cached/old deployment artifact.
