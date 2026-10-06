import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductService } from '../../../../core/services/product.service';
import { CartService } from '../../../../core/services/cart.service';
import { FavoritesService } from '../../../../core/services/favorites.service';
import { CategoryService } from '../../../../core/services/category.service';
import { AdSlot } from '../../../../core/components/ad-slot/ad-slot';

interface PriceRange { min: number; max: number; label: string; }

@Component({
  selector: 'app-products',
  imports: [RouterLink, AdSlot],
  templateUrl: './products.html',
  styleUrl: './products.css',
})
export class Products {
  readonly productService = inject(ProductService);
  readonly cart = inject(CartService);
  readonly fav = inject(FavoritesService);
  private categoryService = inject(CategoryService);

  readonly categories = computed(() => {
    const all = this.productService.list();
    const pr = this.selectedPrice();
    const base = pr ? all.filter(p => p.price >= pr.min && p.price < pr.max) : all;
    return [...this.categoryService.list()]
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .map(c => ({
        ...c,
        count: base.filter(p => p.category === c.name).length,
      }));
  });

  readonly selectedCats = signal<Set<string>>(new Set());
  readonly selectedCatsLabel = computed(() => Array.from(this.selectedCats()).sort((a, b) => a.localeCompare(b, 'pt-BR')).join(' - '));
  readonly priceRanges: PriceRange[] = [
    { label: 'Até R$ 500', min: 0, max: 500 },
    { label: 'R$ 500 - R$ 1.000', min: 500, max: 1000 },
    { label: 'R$ 1.000 - R$ 3.000', min: 1000, max: 3000 },
    { label: 'Acima de R$ 3.000', min: 3000, max: Infinity },
  ];
  readonly selectedPrice = signal<PriceRange | null>(null);

  readonly filtered = computed(() => {
    let list = this.productService.list();
    const cats = this.selectedCats();
    if (cats.size > 0) list = list.filter(p => cats.has(p.category));
    const pr = this.selectedPrice();
    if (pr) list = list.filter(p => p.price >= pr.min && p.price < pr.max);
    return list;
  });

  readonly sortOpts = ['Mais Relevantes', 'Menor Preço', 'Maior Preço', 'Melhor Avaliação'];
  readonly selectedSort = signal(this.sortOpts[0]);
  readonly page = signal(1);
  readonly pageSize = 12;

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));

  get displayProducts() {
    let list = [...this.filtered()];
    const sort = this.selectedSort();
    switch (sort) {
      case 'Menor Preço': list.sort((a, b) => a.price - b.price); break;
      case 'Maior Preço': list.sort((a, b) => b.price - a.price); break;
      case 'Melhor Avaliação': list.sort((a, b) => b.rating - a.rating); break;
    }
    const start = (this.page() - 1) * this.pageSize;
    return list.slice(start, start + this.pageSize);
  }

  toggleCat(name: string): void {
    this.selectedCats.update(s => {
      const n = new Set(s);
      if (n.has(name)) n.delete(name); else n.add(name);
      return n;
    });
    this.page.set(1);
  }

  pickPrice(r: PriceRange | null): void {
    this.selectedPrice.set(r);
    this.page.set(1);
  }

  applyFilters(): void { this.page.set(1); }

  limparFiltros(): void {
    this.selectedCats.set(new Set());
    this.selectedPrice.set(null);
    this.page.set(1);
  }

  getStars(rating: number): string[] {
    const full = Math.floor(rating);
    const s: string[] = [];
    for (let i = 0; i < full; i++) s.push('full');
    while (s.length < 5) s.push('empty');
    return s;
  }

  fmt(v: number): string {
    return v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  }
}
