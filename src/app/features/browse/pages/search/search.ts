import { Component, computed, inject } from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { ProductService } from '../../../../core/services/product.service';
import { CartService } from '../../../../core/services/cart.service';
import { FavoritesService } from '../../../../core/services/favorites.service';
import { AdSlot } from '../../../../core/components/ad-slot/ad-slot';

@Component({
  selector: 'app-search',
  imports: [RouterLink, FormsModule, AdSlot],
  templateUrl: './search.html',
  styleUrl: './search.css',
})
export class Search {
  readonly cart = inject(CartService);
  readonly fav = inject(FavoritesService);
  private route = inject(ActivatedRoute);
  private productService = inject(ProductService);

  readonly query = toSignal(
    this.route.queryParamMap.pipe(map(p => p.get('q') ?? '')),
    { initialValue: '' }
  );

  readonly results = computed(() => {
    const q = this.query().toLowerCase().trim();
    if (!q) return [];
    return this.productService.list().filter(p =>
      p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
    );
  });

  sortOptions = ['Mais Relevantes', 'Menor Preço', 'Maior Preço'];
  selectedSort = this.sortOptions[0];
  currentPage = 1;
  readonly pageSize = 12;

  readonly sortedResults = computed(() => {
    const list = [...this.results()];
    switch (this.selectedSort) {
      case 'Menor Preço': return list.sort((a, b) => a.price - b.price);
      case 'Maior Preço': return list.sort((a, b) => b.price - a.price);
      default: return list;
    }
  });

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.sortedResults().length / this.pageSize)));

  readonly pagedResults = computed(() => {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.sortedResults().slice(start, start + this.pageSize);
  });
}
