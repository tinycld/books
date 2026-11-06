package books

import (
	"strings"
	"testing"

	"tinycld.org/core/branding"
)

func testDocument(customer string, lines int) pdfDocument {
	doc := pdfDocument{
		Title:    "Invoice",
		Number:   "1042",
		Currency: "USD",
		Dates:    []pdfDate{{Label: "Date", Day: "2026-11-05"}, {Label: "Due", Day: "2026-12-05"}},
		Company: pdfCompany{
			Name:    "Acme Books LLC",
			Address: "123 Main St\nSpringfield, IL 62701",
			Email:   "billing@acme.test",
		},
		Parties: []pdfParty{{Label: "Bill to", Name: customer, Company: "Northwind Traders",
			Address: &postalAddress{
				Line1: "500 Market St", City: "San Francisco", Region: "CA", PostalCode: "94105",
			}}},
		TaxLines:  []pdfTaxLine{{Name: "State sales tax", RatePpm: 62500, AmountCents: 0}},
		BigAmount: pdfAmount{Label: "Balance due"},
		Notes:     "Thank you.\nPay within 30 days.",
	}
	for i := 0; i < lines; i++ {
		doc.Lines = append(doc.Lines, pdfLine{
			Kind: lineItem, Item: "Consulting", Description: "Consulting hours",
			Quantity: "2", RateCents: 12500, AmountCents: 25000,
		})
		doc.SubtotalCents += 25000
	}
	doc.TaxLines[0].AmountCents = taxOn(doc.SubtotalCents, 62500)
	total := doc.SubtotalCents + doc.TaxLines[0].AmountCents
	doc.Totals = []pdfAmount{{Label: "Total", Cents: total}}
	doc.BigAmount.Cents = total
	return doc
}

func testOrg() branding.Org {
	return branding.Org{Name: "Acme Incorporated", Color: branding.DefaultColor}
}

func TestPDFView_FormatsAmountsDatesTaxLinesAndAddresses(t *testing.T) {
	doc := testDocument("Jordan Lee", 1)
	doc.Currency = "EUR"
	doc.Lines = append(doc.Lines,
		pdfLine{Kind: lineDescription, Description: "Hours billed at the standard rate."},
		pdfLine{Kind: lineSubtotal, AmountCents: 25000})
	v := pdfViewOf(doc, testOrg())
	if got := v.Rows[0]; got.Rate != "€125.00" || got.Amount != "€250.00" ||
		got.Quantity != "2" || got.Kind != "item" {
		t.Errorf("item row = %+v", got)
	}
	if got := v.Rows[1]; got.Kind != "description" || got.Amount != "" ||
		got.Description[0] != "Hours billed at the standard rate." {
		t.Errorf("description row = %+v", got)
	}
	if got := v.Rows[2]; got.Kind != "subtotal" || got.Description[0] != "Subtotal" ||
		got.Amount != "€250.00" {
		t.Errorf("subtotal row = %+v", got)
	}
	if v.Dates[0].Text != "Nov 5, 2026" || v.Dates[1].Label != "Due" {
		t.Errorf("dates = %+v", v.Dates)
	}
	if v.Summary[1].Label != "State sales tax (6.25%)" || v.Summary[1].Text != "€15.63" {
		t.Errorf("tax line = %+v", v.Summary[1])
	}
	last := v.Summary[len(v.Summary)-1]
	if last.Label != "Total" || !last.Final || v.Summary[0].Label != "Subtotal" {
		t.Errorf("summary = %+v", v.Summary)
	}
	wantParty := "Jordan Lee|Northwind Traders|500 Market St|San Francisco, CA 94105"
	if strings.Join(v.Parties[0].Lines, "|") != wantParty {
		t.Errorf("party lines = %q", v.Parties[0].Lines)
	}
	if strings.Join(v.Company.Lines, "|") != "123 Main St|Springfield, IL 62701|billing@acme.test" {
		t.Errorf("company lines = %q", v.Company.Lines)
	}
	if strings.Join(v.Notes, "|") != "Thank you.|Pay within 30 days." {
		t.Errorf("notes = %q", v.Notes)
	}
}

// With no business name in Books settings the organization name heads the page.
func TestPDFView_CompanyFallsBackToTheOrgName(t *testing.T) {
	doc := testDocument("Jordan Lee", 1)
	doc.Company.Name = "  "
	if v := pdfViewOf(doc, testOrg()); v.Company.Name != "Acme Incorporated" {
		t.Errorf("company name = %q", v.Company.Name)
	}
}

// The column headers take white or near-black, whichever has the higher
// contrast on the brand color; the title takes the brand color only where it
// reads as text on white (4.5:1), else the body text color.
func TestPDFView_PicksReadableTextOnTheBrandColor(t *testing.T) {
	for color, want := range map[string]struct{ onColor, ink string }{
		"#0d9488": {"#111111", "#222222"}, // the default teal: 3.7:1 on white
		"#000000": {"#ffffff", "#000000"},
		"#1e40af": {"#ffffff", "#1e40af"},
		"#767676": {"#ffffff", "#767676"}, // 4.54:1 on white
		"#777777": {"#ffffff", "#222222"}, // 4.48:1 on white
		"#ffff00": {"#111111", "#222222"},
		"#ffffff": {"#111111", "#222222"},
		"#f9a825": {"#111111", "#222222"},
	} {
		org := testOrg()
		org.Color = color
		v := pdfViewOf(testDocument("Jordan Lee", 1), org)
		if string(v.Brand.TextOnColor) != want.onColor {
			t.Errorf("text on %s = %s, want %s", color, v.Brand.TextOnColor, want.onColor)
		}
		if string(v.Brand.Ink) != want.ink {
			t.Errorf("ink for %s = %s, want %s", color, v.Brand.Ink, want.ink)
		}
		if string(v.Brand.Color) != color {
			t.Errorf("brand color = %s, want %s", v.Brand.Color, color)
		}
	}
}

// A color that is not #rrggbb never reaches the CSS: the default prints.
func TestPDFView_RejectsAColorThatIsNotHex(t *testing.T) {
	org := testOrg()
	org.Color = "red;} body{display:none"
	v := pdfViewOf(testDocument("Jordan Lee", 1), org)
	if string(v.Brand.Color) != branding.DefaultColor {
		t.Errorf("brand color = %s", v.Brand.Color)
	}
}

func TestPDFView_LogoIsADataURIOnlyForImageTypes(t *testing.T) {
	org := testOrg()
	org.Logo, org.LogoType = []byte{0x89, 'P', 'N', 'G'}, "image/png"
	v := pdfViewOf(testDocument("Jordan Lee", 1), org)
	if !v.Brand.HasLogo || string(v.Brand.LogoSrc) != "data:image/png;base64,iVBORw==" {
		t.Errorf("png logo = %v %q", v.Brand.HasLogo, v.Brand.LogoSrc)
	}
	org.LogoType = "image/svg+xml"
	if v := pdfViewOf(testDocument("Jordan Lee", 1), org); v.Brand.HasLogo {
		t.Error("an svg logo was embedded")
	}
	if v := pdfViewOf(testDocument("Jordan Lee", 1), testOrg()); v.Brand.HasLogo {
		t.Error("no logo, but HasLogo")
	}
}

func TestPDFDocument_ValidateRefusesWhatCannotPrint(t *testing.T) {
	cases := map[string]func(d *pdfDocument){
		"no title":          func(d *pdfDocument) { d.Title = "" },
		"bad currency":      func(d *pdfDocument) { d.Currency = "usd" },
		"bad day":           func(d *pdfDocument) { d.Dates[0].Day = "2026-02-30" },
		"amount too big":    func(d *pdfDocument) { d.Lines[0].AmountCents = maxStoredAmount + 1 },
		"total too small":   func(d *pdfDocument) { d.Totals[0].Cents = -maxStoredAmount - 1 },
		"rate out of range": func(d *pdfDocument) { d.TaxLines[0].RatePpm = maxRatePpm + 1 },
		"no totals row":     func(d *pdfDocument) { d.Totals = nil },
		"number too long": func(d *pdfDocument) {
			d.Number = strings.Repeat("9", maxPDFNumberLen+1)
		},
		"too many lines": func(d *pdfDocument) {
			d.Lines = make([]pdfLine, maxPDFLines+1)
		},
	}
	if err := testDocument("Jordan Lee", 1).validate(); err != nil {
		t.Fatalf("a valid document was refused: %v", err)
	}
	for name, breakIt := range cases {
		doc := testDocument("Jordan Lee", 1)
		breakIt(&doc)
		if err := doc.validate(); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
}

func TestPDFDocument_ValidateAcceptsANumberAtTheBound(t *testing.T) {
	doc := testDocument("Jordan Lee", 1)
	doc.Number = strings.Repeat("9", maxPDFNumberLen)
	if err := doc.validate(); err != nil {
		t.Errorf("a number at the bound was refused: %v", err)
	}
}

func TestPDFView_WhitespaceOrgNameIsTrimmedAndEmptyStaysEmpty(t *testing.T) {
	doc := testDocument("Jordan Lee", 1)
	doc.Company.Name = ""
	org := testOrg()
	org.Name = "  Acme Incorporated \n"
	if v := pdfViewOf(doc, org); v.Company.Name != "Acme Incorporated" {
		t.Errorf("company name = %q", v.Company.Name)
	}
	org.Name = "  \n "
	if v := pdfViewOf(doc, org); v.Company.Name != "" {
		t.Errorf("empty company name = %q", v.Company.Name)
	}
}

func TestPDFView_PartyCompanyEqualToNameIsDroppedIgnoringCaseAndSpace(t *testing.T) {
	doc := testDocument("Jordan Lee", 1)
	doc.Parties[0].Company = "  JORDAN lee "
	doc.Parties[0].Address = nil
	if got := pdfViewOf(doc, testOrg()).Parties[0].Lines; strings.Join(got, "|") != "Jordan Lee" {
		t.Errorf("party lines = %q", got)
	}
}

func TestPDFView_TextOnAndInkAreTotalForANonHexColor(t *testing.T) {
	for _, bad := range []string{"", "#fff", "red", "#12345", "#gggggg", "0d9488"} {
		if got := textOn(bad); got != "#111111" {
			t.Errorf("textOn(%q) = %s", bad, got)
		}
		if got := inkOnWhite(bad); got != "#222222" {
			t.Errorf("inkOnWhite(%q) = %s", bad, got)
		}
	}
}
