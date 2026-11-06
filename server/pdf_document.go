package books

import (
	"encoding/base64"
	"fmt"
	"html/template"
	"math"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"

	"tinycld.org/core/branding"
)

// A printed Books document in stored units: cents, YYYY-MM-DD days and ppm
// rates. A document kind (pdf_kinds.go) builds it from records; pdfViewOf
// formats it for the one template (pdf_template.html).

type pdfLineKind int

const (
	lineItem        pdfLineKind = iota // a product or service with quantity, rate and amount
	lineSubtotal                       // the sum of the item rows since the last subtotal
	lineDescription                    // text only, no amounts
)

// maxPDFLines bounds one document's rows so a runaway caller cannot pin a
// core laying out an endless table (300 rows render in well under a second).
const maxPDFLines = 5000

type pdfDocument struct {
	Title         string     // "Invoice"
	Number        string     // printed after "No."; "" prints no number
	Currency      string     // ISO code of every amount
	Dates         []pdfDate  // in print order: "Date", "Due"
	Company       pdfCompany // the seller, from books_settings
	Parties       []pdfParty // "Bill to", "Ship to"
	Lines         []pdfLine
	SubtotalCents int64
	TaxLines      []pdfTaxLine
	Totals        []pdfAmount // after the tax lines; the last prints bold
	BigAmount     pdfAmount   // top right; Label "" prints none
	Notes         string      // free text; line breaks kept
}

type pdfDate struct{ Label, Day string }

// pdfCompany is the seller block. Address is books_settings' free-text
// address, printed one line per line.
type pdfCompany struct{ Name, Address, Phone, Email, Website string }

type pdfParty struct {
	Label, Name, Company string
	Address              *postalAddress
}

type pdfLine struct {
	Kind        pdfLineKind
	Item        string // product or service name
	Description string
	Quantity    string // printed as given: the kind decides its precision
	RateCents   int64
	AmountCents int64
}

// pdfTaxLine prints the rate's or group's name with its percentage.
type pdfTaxLine struct {
	Name        string
	RatePpm     int64
	AmountCents int64
}

type pdfAmount struct {
	Label string
	Cents int64
}

// maxPDFNumberLen matches the longest short text Books stores (a phone number).
const maxPDFNumberLen = 40

var currencyCode = regexp.MustCompile(`^[A-Z]{3}$`)

// validate refuses a document the formatters cannot print truthfully.
func (d pdfDocument) validate() error {
	if strings.TrimSpace(d.Title) == "" {
		return fmt.Errorf("books: pdf: document has no title")
	}
	if utf8.RuneCountInString(d.Number) > maxPDFNumberLen {
		return fmt.Errorf("books: pdf: number is longer than %d characters", maxPDFNumberLen)
	}
	if len(d.Totals) == 0 {
		return fmt.Errorf("books: pdf: document has no totals row")
	}
	if !currencyCode.MatchString(d.Currency) {
		return fmt.Errorf("books: pdf: currency %q is not an ISO code", d.Currency)
	}
	if len(d.Lines) > maxPDFLines {
		return fmt.Errorf("books: pdf: %d lines is more than %d", len(d.Lines), maxPDFLines)
	}
	for _, date := range d.Dates {
		if _, err := parseDay(date.Day); err != nil {
			return fmt.Errorf("books: pdf: %s: %w", date.Label, err)
		}
	}
	amounts := []int64{d.SubtotalCents, d.BigAmount.Cents}
	for _, l := range d.Lines {
		amounts = append(amounts, l.RateCents, l.AmountCents)
	}
	for _, t := range d.TaxLines {
		if t.RatePpm < 0 || t.RatePpm > maxRatePpm {
			return fmt.Errorf("books: pdf: tax rate %d ppm is out of range", t.RatePpm)
		}
		amounts = append(amounts, t.AmountCents)
	}
	for _, t := range d.Totals {
		amounts = append(amounts, t.Cents)
	}
	for _, a := range amounts {
		if a > maxStoredAmount || a < -maxStoredAmount {
			return fmt.Errorf("books: pdf: amount %d is past 2^53-1 cents", a)
		}
	}
	return nil
}

// pdfView is the document as the template prints it: every value a string.
type pdfView struct {
	Title, Number string
	Dates         []pdfText
	Company       pdfBlock
	Parties       []pdfBlock
	Rows          []pdfRow
	Summary       []pdfText // subtotal, tax lines, totals
	BigAmount     pdfText
	Notes         []string
	Brand         pdfBrand
}

type pdfText struct {
	Label, Text string
	Final       bool // the last summary row, printed bold
}

type pdfBlock struct {
	Label, Name string
	Lines       []string
}

type pdfRow struct {
	Kind                         string // "item", "subtotal" or "description": the row's CSS class
	Item, Quantity, Rate, Amount string
	Description                  []string
}

type pdfBrand struct {
	Color       template.CSS // validated #rrggbb
	TextOnColor template.CSS // #ffffff or #111111, whichever reads better on Color
	Ink         template.CSS // Color when it reads as text on white, else #222222
	LogoSrc     template.URL // a data: URI built here from the logo bytes
	HasLogo     bool
}

func pdfViewOf(doc pdfDocument, org branding.Org) pdfView {
	money := func(cents int64) string { return formatMoney(cents, doc.Currency) }
	v := pdfView{Title: doc.Title, Number: doc.Number, Brand: brandOf(org)}
	for _, d := range doc.Dates {
		v.Dates = append(v.Dates, pdfText{Label: d.Label, Text: formatDay(d.Day)})
	}
	v.Company = pdfBlock{
		Name:  strings.TrimSpace(doc.Company.Name),
		Lines: lines(doc.Company.Address),
	}
	if v.Company.Name == "" {
		v.Company.Name = strings.TrimSpace(org.Name)
	}
	contact := nonEmpty(doc.Company.Phone, doc.Company.Email, doc.Company.Website)
	v.Company.Lines = append(v.Company.Lines, contact...)
	for _, p := range doc.Parties {
		block := pdfBlock{Label: p.Label, Lines: nonEmpty(p.Name)}
		sameAsName := strings.EqualFold(strings.TrimSpace(p.Company), strings.TrimSpace(p.Name))
		if p.Company != "" && !sameAsName {
			block.Lines = append(block.Lines, p.Company)
		}
		block.Lines = append(block.Lines, formatAddressLines(p.Address)...)
		v.Parties = append(v.Parties, block)
	}
	for _, l := range doc.Lines {
		v.Rows = append(v.Rows, rowOf(l, money))
	}
	v.Summary = append(v.Summary, pdfText{Label: "Subtotal", Text: money(doc.SubtotalCents)})
	for _, t := range doc.TaxLines {
		v.Summary = append(v.Summary, pdfText{
			Label: fmt.Sprintf("%s (%s)", t.Name, ratePercentText(t.RatePpm)),
			Text:  money(t.AmountCents),
		})
	}
	for _, t := range doc.Totals {
		v.Summary = append(v.Summary, pdfText{Label: t.Label, Text: money(t.Cents)})
	}
	v.Summary[len(v.Summary)-1].Final = true
	if doc.BigAmount.Label != "" {
		v.BigAmount = pdfText{Label: doc.BigAmount.Label, Text: money(doc.BigAmount.Cents)}
	}
	v.Notes = lines(doc.Notes)
	return v
}

func rowOf(l pdfLine, money func(int64) string) pdfRow {
	switch l.Kind {
	case lineSubtotal:
		return pdfRow{
			Kind:        "subtotal",
			Description: []string{"Subtotal"},
			Amount:      money(l.AmountCents),
		}
	case lineDescription:
		return pdfRow{Kind: "description", Description: lines(l.Description)}
	default:
		return pdfRow{
			Kind:        "item",
			Item:        l.Item,
			Description: lines(l.Description),
			Quantity:    l.Quantity,
			Rate:        money(l.RateCents),
			Amount:      money(l.AmountCents),
		}
	}
}

// lines splits free text into its non-blank lines.
func lines(text string) []string {
	var out []string
	for _, l := range strings.Split(text, "\n") {
		if l = strings.TrimSpace(l); l != "" {
			out = append(out, l)
		}
	}
	return out
}

// brandOf re-checks the color and logo type even though branding.Load already
// vets them: template.CSS and template.URL skip html/template's escaping, and
// branding.Org is a plain struct anyone can build.
func brandOf(org branding.Org) pdfBrand {
	color := strings.ToLower(org.Color)
	if !branding.IsValidColor(color) {
		color = branding.DefaultColor
	}
	b := pdfBrand{
		Color:       template.CSS(color),
		TextOnColor: template.CSS(textOn(color)),
		Ink:         template.CSS(inkOnWhite(color)),
	}
	if len(org.Logo) > 0 && branding.IsLogoType(org.LogoType) {
		logo := base64.StdEncoding.EncodeToString(org.Logo)
		b.LogoSrc = template.URL("data:" + org.LogoType + ";base64," + logo)
		b.HasLogo = true
	}
	return b
}

// Text colors the page uses beside the brand color.
const (
	pageWhite = "#ffffff"
	nearBlack = "#111111"
	pageInk   = "#222222" // the body text color of pdf_template.html
)

// textOn picks the header text color for a brand color: white or near-black,
// whichever has the higher contrast. The 10pt bold column headers are not WCAG
// large text, so no fixed threshold is safe. Anything that is not #rrggbb gets
// near-black.
func textOn(hex string) string {
	if !branding.IsValidColor(hex) {
		return nearBlack
	}
	if contrast(hex, pageWhite) > contrast(hex, nearBlack) {
		return pageWhite
	}
	return nearBlack
}

// inkOnWhite is the color of brand-colored text on the white page (the title):
// the brand color when it reaches 4.5:1 on white (WCAG AA for normal text),
// else the body text color, so a light brand such as yellow stays readable.
func inkOnWhite(hex string) string {
	if branding.IsValidColor(hex) && contrast(hex, pageWhite) >= 4.5 {
		return hex
	}
	return pageInk
}

// contrast is the WCAG contrast ratio of two #rrggbb colors.
func contrast(a, b string) float64 {
	la, lb := luminance(a), luminance(b)
	if la < lb {
		la, lb = lb, la
	}
	return (la + 0.05) / (lb + 0.05)
}

// luminance is the WCAG relative luminance of a #rrggbb color.
func luminance(hex string) float64 {
	channel := func(i int) float64 {
		v, _ := strconv.ParseUint(hex[i:i+2], 16, 8)
		c := float64(v) / 255
		if c <= 0.03928 {
			return c / 12.92
		}
		return math.Pow((c+0.055)/1.055, 2.4)
	}
	return 0.2126*channel(1) + 0.7152*channel(3) + 0.0722*channel(5)
}
